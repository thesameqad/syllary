import { env } from "../env.js";

// Cheap image generation via fal.ai (FLUX schnell by default). Used for AI
// album covers — a supplemental, no-embedded-text image where a fast diffusion
// model at ~$0.003/image is plenty (vs ~$0.068 for Nano Banana on OpenRouter,
// which we keep for lyric-VIDEO backdrops that DO need rendered text).
//
// fal.run is synchronous (the HTTP response IS the result), mirroring the
// auth + endpoint pattern in fal-stt.ts.

const FAL_BASE = "https://fal.run";

/** fal image_size presets. Covers are square. */
type FalImageSize =
  | "square_hd"
  | "square"
  | "portrait_4_3"
  | "portrait_16_9"
  | "landscape_4_3"
  | "landscape_16_9";

type FalImageResponse = {
  images?: { url?: string; content_type?: string }[];
};

/** Generate one image via fal.ai and return its raw bytes + content type.
 *  Throws on any failure (callers map this to a user-facing error). */
export async function generateFalImage(opts: {
  prompt: string;
  imageSize?: FalImageSize;
}): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(`${FAL_BASE}/${env.FAL_IMAGE_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${env.FAL_AI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: opts.prompt,
      image_size: opts.imageSize ?? "square_hd",
      num_images: 1,
    }),
  });
  if (!res.ok) {
    throw new Error(`fal image failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as FalImageResponse;
  const image = data.images?.find((i) => i?.url);
  if (!image?.url) {
    throw new Error("fal image returned no URL.");
  }

  // fal serves the result from its CDN; fetch it into bytes for R2 upload.
  const file = await fetch(image.url);
  if (!file.ok) {
    throw new Error(`fetch fal image failed: ${file.status}`);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error("fal image was empty.");
  }
  const contentType =
    image.content_type || file.headers.get("content-type") || "image/jpeg";
  return { buffer, contentType };
}
