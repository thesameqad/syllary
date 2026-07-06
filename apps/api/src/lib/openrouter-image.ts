import type { AspectRatio, CharacterReference, ImageQuality, ImageSize } from "@syllary/shared";
import { env } from "../env.js";
import { presignGet } from "./r2.js";

// OpenRouter returns generated images on the assistant message as an `images`
// array of data URLs (it can also, less commonly, inline a data URL in the
// text content). Type both shapes loosely and dig the base64 out of whichever
// is present.
type ImagePart = { type?: string; image_url?: { url?: string } };
type ChatImageResponse = {
  choices?: { message?: { content?: string; images?: ImagePart[] } }[];
  error?: { message?: string };
};

const ASPECT_HINT: Record<AspectRatio, string> = {
  "16:9": "16:9 widescreen landscape",
  "9:16": "9:16 vertical portrait",
  "1:1": "1:1 square",
};

/** Pull the first base64 data URL out of an OpenRouter image response. */
function extractDataUrl(data: ChatImageResponse): string | null {
  const message = data.choices?.[0]?.message;
  const fromImages = message?.images?.find((p) => p?.image_url?.url)?.image_url?.url;
  if (typeof fromImages === "string" && fromImages.startsWith("data:")) return fromImages;
  // Fallback: a data URL embedded in the text content.
  const content = message?.content;
  if (typeof content === "string") {
    const match = content.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);
    if (match) return match[0];
  }
  return null;
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(",");
  return Buffer.from(dataUrl.slice(comma + 1), "base64");
}

/** Build the frame prompt for one scene from three independent parts:
 *   - `style`     — the art direction (shared across the whole video)
 *   - `context`   — the song "consistency guide" (show bible): who the recurring
 *                   character is, the setting and motifs. Shared across the whole
 *                   video and used ONLY to keep scenes consistent — it must NOT
 *                   become the subject of every frame.
 *   - `direction` — what THIS scene depicts (e.g. "girl walking away"). Defaults
 *                   to the lyric line when blank.
 *   - `lyricText` — the actual lyric, rendered INTO the image as typography
 *                   (Gemini 3 Pro Image has excellent text rendering) styled to
 *                   match the art direction. Independent of `direction`.
 *
 * The CURRENT line (or per-scene direction) drives WHAT happens in this frame;
 * `context` only governs WHO/WHERE so the character and world stay consistent.
 * Without this split, the song-wide brief ("a monster dancing") would override
 * every line, so a line about "roaring quietly" would still show dancing.
 *
 * Manual mode lets the user edit `style` + `context` (shared) and `direction`
 * (per-scene) separately, so the common case is just typing a short direction. */
export function buildBackdropPrompt(opts: {
  style: string;
  lyricText: string;
  aspectRatio: AspectRatio;
  renderText: boolean;
  context?: string;
  direction?: string;
  /** Band-member characters to depict (named), restyled. When present the prompt
   *  makes them the subject and the "no real people" guard is dropped. The images
   *  themselves are attached, name-labeled, by generateBackdrop. */
  characterReferences?: CharacterReference[];
}): string {
  const { aspectRatio, renderText } = opts;
  const style = opts.style.trim();
  const line = opts.lyricText.trim();
  const ctx = opts.context?.trim();
  const characterRefs = (opts.characterReferences ?? []).filter((c) => c.imageKeys.length > 0);
  const chars = characterRefs.length;
  const charNames = characterRefs.map((c) => c.name.trim()).filter(Boolean);
  const named = charNames.length > 0;
  // What THIS scene depicts — the user's per-scene direction, falling back to the
  // lyric line. Strip "@" so "@Emily gives flowers to @Justin" reads naturally
  // and matches the name labels on the reference photos.
  const subject = (opts.direction?.trim() || line).replace(/@(?=[\p{L}\d])/gu, "");
  const hasSubject = subject.length > 0;

  // The consistency guide is framed as character/world constants ONLY — never as
  // the subject of this frame. The subject always comes from the current line.
  const story = ctx
    ? [
        `Consistency guide for the whole music video — use it ONLY to keep the recurring character and world the SAME across scenes (same character design, setting, motifs); do NOT make it the subject of this frame: ${ctx}`,
      ]
    : [];
  const consistency = ctx
    ? `Keep the character and world consistent with the guide above, but the action and imagery of THIS frame must come strictly from the moment below — do not fall back to a generic shot of the overall theme.`
    : ``;
  // When reference photos are attached, the recurring CHARACTERS are the subject:
  // preserve likeness, restyle into the art direction; the line/direction drives
  // the action. The photos are NAME-LABELED, so the prompt names each character
  // and pins the exact head-count (else the model clones one person per photo).
  // Drops the "no real people" guard (which would contradict this).
  const nameList = charNames.join(" and ");
  const idLine = named
    ? `The reference photos are LABELED with each character's name (${charNames.join(", ")}).`
    : ``;
  const characterBlock =
    chars === 0
      ? ``
      : chars === 1
        ? `${idLine} The attached reference photo(s) all show ONE single recurring CHARACTER${named ? ` named ${charNames[0]}` : ""} (any extra photos are just different angles/expressions of the SAME person). Depict EXACTLY ONE character — that same identifiable individual${named ? `, ${charNames[0]}` : ""} — never two or more copies. Preserve their face, hair, build and defining features, but fully RESTYLE them into the art direction above (do NOT reproduce the photographic look). They are the subject performing the action of this moment; the photos define WHO they are, not what they're doing or the setting.`
        : `${idLine} The attached reference photos show EXACTLY ${chars} distinct recurring CHARACTERS${named ? ` — ${nameList}` : ""} (a character may have several photos that are just extra angles of the SAME person — do NOT treat those as additional people). Depict EXACTLY these ${chars} characters${named ? ` (${charNames.join(", ")})` : ""}, no duplicates and no extra people. Match each by their NAME LABEL; preserve each one's face, hair, build and defining features, but fully RESTYLE them into the art direction above.${named ? ` Follow the scene's direction for who does what (e.g. "${charNames[0]}" is whoever the direction names).` : ""} Keep each distinct and recognizable. The photos define WHO they are, not what they're doing or the setting.`;
  const peopleLine = (singers: boolean) =>
    chars > 0
      ? `Rich depth, dramatic lighting, high detail.`
      : `No real recognizable people${singers ? " or singers" : ""}. Rich depth, dramatic lighting, high detail.`;

  const styled = [
    ...story,
    `Cinematic ${ASPECT_HINT[aspectRatio]} frame for a music lyric video. This is ONE specific moment in the song — illustrate exactly this moment, not a generic image of the whole song.`,
    `Art direction: ${style}.`,
    `Depict the literal action, imagery and emotion of this exact moment: ${subject}.`,
    consistency,
    characterBlock,
    // Grouped scenes bake a STANZA: every line of the group, stacked, in order.
    line.includes("\n")
      ? `Render these ${line.split("\n").length} short lyric lines as ONE elegant stacked lyric block — the hero typography of the image — in this exact order, each on its own line, integrated INTO the scene and styled to match the art direction (for example: glowing neon tubing if the style is neon, gold foil if elegant, hand-painted if folk):`
      : `Render this exact lyric as the hero typography of the image, large and beautifully legible, integrated INTO the scene and styled to match the art direction (for example: glowing neon tubing if the style is neon, gold foil if elegant, hand-painted if folk):`,
    `"${line}"`,
    line.includes("\n")
      ? `Spell every line EXACTLY as written, keeping the given line breaks. Show ONLY these lines of text — no other words, captions, watermarks, logos, signatures, or duplicate text.`
      : `Spell it EXACTLY as written. Show ONLY this line of text — no other words, captions, watermarks, logos, signatures, or duplicate text.`,
    `Anchor the text to a physical surface or object in the scene — a billboard, wall, sign, screen, banner, or the side of an object — with matching perspective and lighting, so it exists INSIDE the world. Never float it as a flat caption over the image.`,
    `Keep the text fully inside the frame with generous safe margins from every edge so it is never cut off, with strong contrast against the background.`,
    peopleLine(true),
  ];
  // Text-free scene that still evokes the moment (used by Cinematic, where the
  // lyrics are overlaid later by ffmpeg — letting the video model warp baked-in
  // text is what made Cinematic unreadable).
  const sceneOnly = [
    ...story,
    `Cinematic ${ASPECT_HINT[aspectRatio]} frame for a music video. This is ONE specific moment in the song.`,
    `Art direction: ${style}.`,
    hasSubject
      ? `Create a scene that evokes the literal imagery and mood of this exact moment: ${subject} (do NOT write any text).`
      : `Atmospheric instrumental scene.`,
    hasSubject ? consistency : ``,
    characterBlock,
    `Absolutely NO text, letters, words, captions, or watermarks anywhere in the image.`,
    peopleLine(false),
  ];
  const instrumental = [
    ...story,
    `Cinematic ${ASPECT_HINT[aspectRatio]} backdrop for a music lyric video instrumental interlude.`,
    `Art direction: ${style}.`,
    hasSubject
      ? `Depict this scene with no text of any kind: ${subject}.`
      : chars > 0
        ? `Show the recurring character(s) in an atmospheric instrumental moment, no text of any kind.`
        : `Atmospheric, no text or words of any kind.`,
    characterBlock,
    peopleLine(false),
  ];
  if (!renderText) return sceneOnly.filter(Boolean).join(" ");
  return (line ? styled : instrumental).filter(Boolean).join(" ");
}

async function requestImageOnce(
  content: string | Array<Record<string, unknown>>,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  quality: ImageQuality,
): Promise<Buffer | null> {
  // Pro = Nano Banana Pro (best embedded text); Fast = Nano Banana 2 (cheaper).
  const model = quality === "pro" ? env.OPENROUTER_IMAGE_MODEL : env.OPENROUTER_IMAGE_MODEL_FAST;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        modalities: ["image", "text"],
        messages: [{ role: "user", content }],
        // Nano Banana Pro honours image_config for aspect ratio + resolution.
        // 2K source means our 1080p frames aren't upscaled (the default 1K was
        // ~1376px → visibly soft once scaled up).
        image_config: { aspect_ratio: aspectRatio, image_size: imageSize },
      }),
    });
    if (!res.ok) {
      console.warn(`[backdrop] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      // Out of OpenRouter credits (402) / bad key (401): retrying won't help —
      // fail fast with a clear message (NO_RETRY_ marks it for the catch below).
      if (res.status === 402 || res.status === 401) {
        throw new Error("NO_RETRY_OpenRouter credits exhausted — top up your OpenRouter account.");
      }
      return null;
    }
    const data = (await res.json()) as ChatImageResponse;
    const dataUrl = extractDataUrl(data);
    if (!dataUrl) {
      console.warn("[backdrop] no image in response:", JSON.stringify(data).slice(0, 240));
      return null;
    }
    const buf = dataUrlToBuffer(dataUrl);
    return buf.length > 0 ? buf : null;
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (msg.startsWith("NO_RETRY_")) throw new Error(msg.slice("NO_RETRY_".length));
    console.warn("[backdrop] threw:", msg);
    return null;
  }
}

async function withRetries(fn: () => Promise<Buffer | null>): Promise<Buffer> {
  // Longer, more patient backoff: image gen can briefly rate-limit (429) when
  // several frames generate at once, and one failed frame fails the whole job.
  const ATTEMPTS = 5;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const buf = await fn();
    if (buf) return buf;
    if (attempt < ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
  }
  throw new Error(`Image generation failed after ${ATTEMPTS} attempts.`);
}

/** Generate one backdrop frame (with the lyric rendered in) for a lyric line via
 *  Gemini 3 Pro Image on OpenRouter. */
export async function generateBackdrop(opts: {
  style: string;
  lineText: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  /** Image-model tier: "pro" (Nano Banana Pro, sharpest text) or "fast" (Nano
   *  Banana 2, cheaper). */
  quality: ImageQuality;
  /** Render the lyric INTO the image (Slideshow/Living Scenes). False = a
   *  text-free scene (Cinematic, where ffmpeg overlays the lyrics instead). */
  renderText?: boolean;
  /** Manual mode: send this exact prompt instead of building one (the user may
   *  have edited it). */
  promptOverride?: string;
  /** Band-member characters to depict, grouped by member with their name. Each
   *  member's photos are attached labeled with their name so the prompt can
   *  reference them by name ("Emily gives flowers to Justin"). */
  characterReferences?: CharacterReference[];
}): Promise<Buffer> {
  const renderText = opts.renderText ?? true;
  const refs = (opts.characterReferences ?? []).filter((c) => c.imageKeys.length > 0);
  const prompt =
    opts.promptOverride ??
    buildBackdropPrompt({
      style: opts.style,
      lyricText: opts.lineText,
      aspectRatio: opts.aspectRatio,
      renderText,
      characterReferences: refs,
    });
  // Attach each member's photos as image parts, prefixed by a name label so the
  // model can attribute identities. Built once before retries — the 1h presigned
  // URLs outlast the retry window.
  let content: string | Array<Record<string, unknown>> = prompt;
  if (refs.length > 0) {
    const parts: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
    for (const member of refs) {
      if (member.name.trim()) parts.push({ type: "text", text: `Reference photos of ${member.name}:` });
      const urls = await Promise.all(member.imageKeys.map((k) => presignGet(k)));
      for (const url of urls) parts.push({ type: "image_url", image_url: { url } });
    }
    content = parts;
  }
  return withRetries(() => requestImageOnce(content, opts.aspectRatio, opts.imageSize, opts.quality));
}

/** Generate one image conditioned on reference photos (already-resolved URLs),
 *  e.g. a customized-cast-member reference: the prompt describes the outfit/hair
 *  and the attached photos lock the face/identity. Always uses the reference-capable
 *  Nano path (the "fast" quality tier). Throws on failure. */
export async function generateReferencedImage(opts: {
  prompt: string;
  referenceUrls: string[];
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
}): Promise<Buffer> {
  const parts: Array<Record<string, unknown>> = [{ type: "text", text: opts.prompt }];
  for (const url of opts.referenceUrls) parts.push({ type: "image_url", image_url: { url } });
  return withRetries(() => requestImageOnce(parts, opts.aspectRatio, opts.imageSize, "fast"));
}


