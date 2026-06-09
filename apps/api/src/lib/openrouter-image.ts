import type { AspectRatio, ImageQuality, ImageSize } from "@syllary/shared";
import { env } from "../env.js";

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
}): string {
  const { aspectRatio, renderText } = opts;
  const style = opts.style.trim();
  const line = opts.lyricText.trim();
  const ctx = opts.context?.trim();
  // What THIS scene depicts — the user's per-scene direction, falling back to the
  // lyric line so an unedited scene illustrates its own line.
  const subject = opts.direction?.trim() || line;
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
  const styled = [
    ...story,
    `Cinematic ${ASPECT_HINT[aspectRatio]} frame for a music lyric video. This is ONE specific moment in the song — illustrate exactly this moment, not a generic image of the whole song.`,
    `Art direction: ${style}.`,
    `Depict the literal action, imagery and emotion of this exact moment: ${subject}.`,
    consistency,
    `Render this exact lyric as the hero typography of the image, large and beautifully legible, integrated INTO the scene and styled to match the art direction (for example: glowing neon tubing if the style is neon, gold foil if elegant, hand-painted if folk):`,
    `"${line}"`,
    `Spell it EXACTLY as written. Show ONLY this line of text — no other words, captions, watermarks, logos, signatures, or duplicate text.`,
    `Keep the text fully inside the frame with generous safe margins from every edge so it is never cut off, with strong contrast against the background.`,
    `No real recognizable people or singers. Rich depth, dramatic lighting, high detail.`,
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
    `Absolutely NO text, letters, words, captions, or watermarks anywhere in the image.`,
    `No real recognizable people. Rich depth, dramatic lighting, high detail.`,
  ];
  const instrumental = [
    ...story,
    `Cinematic ${ASPECT_HINT[aspectRatio]} backdrop for a music lyric video instrumental interlude.`,
    `Art direction: ${style}.`,
    hasSubject ? `Depict this scene with no text of any kind: ${subject}.` : `Atmospheric, no text or words of any kind.`,
    `No real recognizable people. Rich depth, dramatic lighting, high detail.`,
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
}): Promise<Buffer> {
  const renderText = opts.renderText ?? true;
  const prompt =
    opts.promptOverride ??
    buildBackdropPrompt({
      style: opts.style,
      lyricText: opts.lineText,
      aspectRatio: opts.aspectRatio,
      renderText,
    });
  return withRetries(() => requestImageOnce(prompt, opts.aspectRatio, opts.imageSize, opts.quality));
}


