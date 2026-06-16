import type { CoverModel } from "@syllary/shared";
import { generateFalImage } from "./fal-image.js";
import { generateBackdrop } from "./openrouter-image.js";

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

/** Generate a square reference image for a persisted element. Throws on failure. */
export async function generateElementImage(opts: {
  name: string;
  description: string;
  model: CoverModel;
}): Promise<{ buffer: Buffer; contentType: string }> {
  return generateImageBuffer({
    prompt: buildElementPrompt(opts.name, opts.description),
    model: opts.model,
  });
}
