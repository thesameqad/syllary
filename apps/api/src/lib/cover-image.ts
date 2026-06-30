import type { CoverModel } from "@syllary/shared";
import { generateFalImage } from "./fal-image.js";
import { generateBackdrop, generateReferencedImage } from "./openrouter-image.js";

// AI album cover generation, dispatched by model:
//   - "flux" → fal.ai FLUX schnell (cheap default, ~$0.003/image)
//   - "nano" → Nano Banana 2 (Gemini 3.1 Flash Image via OpenRouter, ~$0.068),
//              the premium option some users prefer.
// Covers are square and text-free (no embedded lyric), unlike video backdrops.

/** Wrap a user's free-text description into an album-cover art prompt. */
export function buildCoverPrompt(description: string): string {
  const desc = description.trim();
  return [
    `Square 1:1 album cover artwork for a music single.`,
    desc ? `Concept: ${desc}.` : `A striking, atmospheric album cover.`,
    `Bold, professional, high-detail cover art with a strong focal point and balanced composition that reads well as a small thumbnail.`,
    `No watermarks, logos, signatures, borders, or stock-photo framing.`,
  ].join(" ");
}

/** Dispatch a single square image generation by model. Shared by cover + element
 *  generation. Returns the image bytes + content type. Throws on failure. */
async function generateImageBuffer(opts: {
  prompt: string;
  model: CoverModel;
}): Promise<{ buffer: Buffer; contentType: string }> {
  if (opts.model === "nano") {
    // Reuse the OpenRouter image path (Nano Banana 2 = the "fast" quality tier),
    // with the prompt passed verbatim — square, no embedded text.
    const buffer = await generateBackdrop({
      style: "",
      lineText: "",
      aspectRatio: "1:1",
      imageSize: "1K",
      quality: "fast",
      renderText: false,
      promptOverride: opts.prompt,
    });
    return { buffer, contentType: "image/png" };
  }
  return generateFalImage({ prompt: opts.prompt, imageSize: "square_hd" });
}

/** Generate a square album cover from a description with the chosen model. */
export async function generateCoverImage(opts: {
  description: string;
  model: CoverModel;
}): Promise<{ buffer: Buffer; contentType: string }> {
  return generateImageBuffer({ prompt: buildCoverPrompt(opts.description), model: opts.model });
}

/** Wrap a description into a clean reference-image prompt for a persisted element
 *  — a recurring subject/prop (a dog, headphones, a guitar) the video model should
 *  depict consistently across scenes. Isolated subject, neutral background. */
export function buildElementPrompt(name: string, description: string): string {
  const label = name.trim() || "a subject";
  const subject = description.trim() || label;
  return [
    `A clean, high-quality reference image of ${label}: ${subject}.`,
    `A single clear subject, centered and fully visible, on a plain neutral studio background.`,
    `Even soft lighting, sharp focus, true-to-life detail — usable as a character/prop reference.`,
    `No text, watermarks, logos, borders, or extra objects.`,
  ].join(" ");
}

/** Wrap an outfit/hair description into a prompt for a "customized cast member"
 *  reference — the SAME person shown in the attached photos, restyled into a fixed
 *  look so their appearance stays locked across every scene of the video. The face
 *  comes from the references; the prompt governs wardrobe/hair AND the video's art
 *  style so the reference already matches the scenes (e.g. a manga illustration, not
 *  a realistic photo). */
export function buildCustomizedMemberPrompt(name: string, outfit: string, style?: string): string {
  const label = name.trim() || "the character";
  const look = outfit.trim();
  const art = style?.trim();
  return [
    `A clean, full-body character reference of ${label} — the SAME individual shown in the attached reference photos (not a lookalike).`,
    `Preserve their facial features, identity and build, and clearly SHOW their face and head — full figure, head-to-toe, facing the camera.`,
    art
      ? `Render the WHOLE character in this exact art style (do NOT make it a realistic photo): ${art}.`
      : ``,
    look
      ? `Give them this exact wardrobe and hair: ${look}. Keep this outfit, hair and styling consistent.`
      : `Keep a clean, consistent wardrobe and hairstyle.`,
    `A single subject, centered on a plain neutral background, evenly lit and sharp — usable as a recurring character reference for a music video.`,
    `No text, watermarks, logos, borders, or extra people.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Generate a reference image for a persisted element. Throws on failure.
 *  - Plain object element (no `referenceUrls`): square image from the description.
 *  - Customized cast member (`referenceUrls` = the source member's photos): a
 *    vertical portrait conditioned on those photos so the face is locked, the
 *    description pinning the outfit/hair. Always uses the reference-capable Nano path. */
export async function generateElementImage(opts: {
  name: string;
  description: string;
  model: CoverModel;
  referenceUrls?: string[];
  /** Customized cast members only: the video's art direction, baked into the
   *  reference so it matches the scenes' style (e.g. manga, not a photo). */
  style?: string;
}): Promise<{ buffer: Buffer; contentType: string }> {
  if (opts.referenceUrls && opts.referenceUrls.length > 0) {
    const buffer = await generateReferencedImage({
      prompt: buildCustomizedMemberPrompt(opts.name, opts.description, opts.style),
      referenceUrls: opts.referenceUrls,
      aspectRatio: "9:16",
      imageSize: "1K",
    });
    return { buffer, contentType: "image/png" };
  }
  return generateImageBuffer({
    prompt: buildElementPrompt(opts.name, opts.description),
    model: opts.model,
  });
}
