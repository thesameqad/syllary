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

/** Generate a square album cover from a description with the chosen model.
 *  Returns the image bytes + content type. Throws on failure. */
export async function generateCoverImage(opts: {
  description: string;
  model: CoverModel;
}): Promise<{ buffer: Buffer; contentType: string }> {
  const prompt = buildCoverPrompt(opts.description);
  if (opts.model === "nano") {
    // Reuse the OpenRouter image path (Nano Banana 2 = the "fast" quality tier),
    // with our cover prompt passed verbatim — square, no embedded text.
    const buffer = await generateBackdrop({
      style: "",
      lineText: "",
      aspectRatio: "1:1",
      imageSize: "1K",
      quality: "fast",
      renderText: false,
      promptOverride: prompt,
    });
    return { buffer, contentType: "image/png" };
  }
  return generateFalImage({ prompt, imageSize: "square_hd" });
}
