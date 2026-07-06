import type { AspectRatio } from "@syllary/shared";
import { env } from "../env.js";

// fal.ai queue API for the Lite tier's motion clips (Seedance 1.5 Pro i2v):
//   POST https://queue.fal.run/<model>  -> { request_id, status_url, response_url }
//   GET  <status_url>                   -> { status: IN_QUEUE | IN_PROGRESS | COMPLETED }
//   GET  <response_url>                 -> { video: { url } }
// The reference image must be a REMOTE URL — we pass a presigned R2 URL of the
// Qwen frame, same as the OpenRouter path. Silent 480p is the whole point:
// (864×480×24fps)/1024 tokens at $1.2/M ≈ $0.0117/s vs Grok's $0.05/s.

type QueueSubmitResponse = {
  request_id?: string;
  status_url?: string;
  response_url?: string;
  detail?: unknown;
};
type QueueStatusResponse = { status?: string; detail?: unknown };
type SeedanceResponse = { video?: { url?: string }; detail?: unknown };

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 180; // ~12 min ceiling per clip (measured ~90s warm).

async function submit(opts: {
  prompt: string;
  firstFrameUrl: string;
  aspectRatio: AspectRatio;
  durationSeconds: number;
}): Promise<{ statusUrl: string; responseUrl: string }> {
  const body = {
    prompt: opts.prompt,
    image_url: opts.firstFrameUrl,
    aspect_ratio: opts.aspectRatio,
    // fal's schema wants the duration as a string enum ("4"…"12").
    duration: String(Math.round(opts.durationSeconds)),
    resolution: "480p",
    generate_audio: false, // silent halves the price; we mux the song ourselves
    camera_fixed: false,
  };
  let lastErr = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`https://queue.fal.run/${env.FAL_VIDEO_MODEL}`, {
        method: "POST",
        headers: { Authorization: `Key ${env.FAL_AI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = (await res.json()) as QueueSubmitResponse;
        if (!data.status_url || !data.response_url) {
          throw new Error(`no queue urls: ${JSON.stringify(data).slice(0, 200)}`);
        }
        return { statusUrl: data.status_url, responseUrl: data.response_url };
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

async function poll(statusUrl: string): Promise<void> {
  for (let i = 0; i < MAX_POLLS; i++) {
    try {
      const res = await fetch(statusUrl, { headers: { Authorization: `Key ${env.FAL_AI_KEY}` } });
      if (res.ok) {
        const data = (await res.json()) as QueueStatusResponse;
        const status = data.status ?? "";
        if (status === "COMPLETED") return;
        if (status !== "IN_QUEUE" && status !== "IN_PROGRESS") {
          throw new Error(`video generation ${status}: ${JSON.stringify(data.detail ?? "").slice(0, 200)}`);
        }
      }
    } catch (e) {
      // Terminal generation status is a real failure; network blips just re-poll.
      if ((e as Error).message?.startsWith("video generation ")) throw e;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("video generation timed out");
}

async function fetchResult(responseUrl: string): Promise<Buffer> {
  const res = await fetch(responseUrl, { headers: { Authorization: `Key ${env.FAL_AI_KEY}` } });
  if (!res.ok) {
    // fal surfaces generation errors (including content moderation) here.
    throw new Error(`video generation failed: HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as SeedanceResponse;
  const url = data.video?.url;
  if (!url) throw new Error(`video completed but returned no URL: ${JSON.stringify(data).slice(0, 200)}`);
  const file = await fetch(url);
  if (!file.ok) throw new Error(`video download HTTP ${file.status}`);
  return Buffer.from(await file.arrayBuffer());
}

const TRANSIENT =
  /could not be fetched|failed to fetch|fetch failed|timed out|timeout|HTTP 5\d\d|network|internal error|try again|temporarily/i;

/** Generate one Seedance 1.5 image-to-video clip via fal (Lite tier) and return
 *  its MP4 bytes. Same transient-retry contract as generateMotionClip so one
 *  flaky shot doesn't sink the job. */
export async function generateLiteMotionClip(opts: {
  prompt: string;
  firstFrameUrl: string;
  aspectRatio: AspectRatio;
  durationSeconds: number;
}): Promise<Buffer> {
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { statusUrl, responseUrl } = await submit(opts);
      await poll(statusUrl);
      return await fetchResult(responseUrl);
    } catch (e) {
      lastErr = (e as Error).message ?? "";
      if (!TRANSIENT.test(lastErr) || attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
  throw new Error(lastErr);
}
