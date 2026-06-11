import type { AspectRatio } from "@syllary/shared";
import { env } from "../env.js";

// OpenRouter async video API (verified contract):
//   POST /api/v1/videos -> { id, polling_url, status }
//   GET  <polling_url>   -> { status, unsigned_urls?: string[] }  (poll until "completed")
// The reference image must be a REMOTE URL (not base64) — we pass a presigned R2
// URL of the Nano Banana frame. "first_frame" animates that exact image (Living
// Scenes); "reference" lets the model reinterpret it freely (Cinematic).

type CreateResponse = {
  id?: string;
  polling_url?: string;
  status?: string;
  error?: { message?: string } | string;
};
type PollResponse = {
  status?: string; // pending | in_progress | completed | failed | cancelled | expired
  unsigned_urls?: string[];
  error?: { message?: string } | string;
};

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 150; // ~12.5 min ceiling per clip.

function errText(e: PollResponse["error"]): string {
  return (typeof e === "string" ? e : e?.message) ?? "unknown error";
}

async function submit(opts: {
  model: string;
  prompt: string;
  firstFrameUrl: string;
  lastFrameUrl?: string;
  aspectRatio: AspectRatio;
  durationSeconds: number;
  resolution: string;
}): Promise<string> {
  const frameImages: Record<string, unknown>[] = [
    { type: "image_url", image_url: { url: opts.firstFrameUrl }, frame_type: "first_frame" },
  ];
  // Optional last frame: the model interpolates first→last. We use the NEXT
  // line's frame here so consecutive shots share a boundary frame (seamless).
  if (opts.lastFrameUrl) {
    frameImages.push({ type: "image_url", image_url: { url: opts.lastFrameUrl }, frame_type: "last_frame" });
  }
  const body: Record<string, unknown> = {
    model: opts.model,
    prompt: opts.prompt,
    aspect_ratio: opts.aspectRatio,
    duration: Math.round(opts.durationSeconds),
    resolution: opts.resolution,
    generate_audio: false,
    frame_images: frameImages,
  };
  // Retry on rate-limit (429), transient 5xx, AND network errors ("fetch
  // failed") with backoff — so higher concurrency / a flaky moment doesn't kill
  // a whole job.
  let lastErr = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/videos", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = (await res.json()) as CreateResponse;
        const pollUrl =
          data.polling_url ?? (data.id ? `https://openrouter.ai/api/v1/videos/${data.id}` : null);
        if (!pollUrl) throw new Error(`no polling_url/id: ${JSON.stringify(data).slice(0, 200)}`);
        return pollUrl;
      }
      lastErr = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
      if (res.status !== 429 && res.status < 500) break; // not transient → fail fast
    } catch (e) {
      lastErr = `network: ${(e as Error).message}`;
    }
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  throw new Error(`video submit ${lastErr}`);
}

async function poll(pollUrl: string): Promise<string> {
  for (let i = 0; i < MAX_POLLS; i++) {
    try {
      const res = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      });
      if (res.ok) {
        const data = (await res.json()) as PollResponse;
        const status = data.status ?? "";
        if (status === "completed") {
          const url = data.unsigned_urls?.[0];
          if (!url) throw new Error("video completed but returned no URL");
          return url;
        }
        if (status === "failed" || status === "cancelled" || status === "expired") {
          throw new Error(`video generation ${status}: ${errText(data.error)}`);
        }
      }
    } catch (e) {
      // A terminal generation status is a real failure; rethrow it. Network
      // blips just mean we poll again.
      if ((e as Error).message?.startsWith("video generation ")) throw e;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("video generation timed out");
}

async function download(videoUrl: string): Promise<Buffer> {
  // The result URL is an OpenRouter-hosted asset that still needs the key.
  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(videoUrl, {
        headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      lastErr = `HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      lastErr = `network: ${(e as Error).message}`;
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(`video download ${lastErr}`);
}

// Provider-reported failures that are usually transient (e.g. the model briefly
// couldn't fetch the input image, or a server-side "internal error … try again").
// Worth resubmitting the whole clip rather than failing the entire job.
const TRANSIENT =
  /could not be fetched|failed to fetch|fetch failed|timed out|timeout|HTTP 5\d\d|network|internal error|try again|temporarily/i;

/** Generate one image-to-video clip and return its MP4 bytes. A `lastFrameUrl`
 *  makes the model interpolate first→last (used by Cinematic for seamless,
 *  scene-changing shots). Retries the whole clip on transient failures so one
 *  flaky shot doesn't sink the entire job. */
export async function generateMotionClip(opts: {
  model: string;
  prompt: string;
  firstFrameUrl: string;
  lastFrameUrl?: string;
  aspectRatio: AspectRatio;
  durationSeconds: number;
  resolution?: string;
}): Promise<Buffer> {
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const pollUrl = await submit({ ...opts, resolution: opts.resolution ?? "1080p" });
      const videoUrl = await poll(pollUrl);
      return await download(videoUrl);
    } catch (e) {
      lastErr = (e as Error).message ?? "";
      if (!TRANSIENT.test(lastErr) || attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
  throw new Error(lastErr);
}
