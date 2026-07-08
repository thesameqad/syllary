import type { AspectRatio } from "@syllary/shared";
import { env } from "../env.js";

// ALL motion clips generate on fal.ai's queue API (benchmarked 2026-07:
// 30-40% faster than the same models via OpenRouter, 0.1s submits, and no
// 1-request/second rate limit so parallel scene regens don't collide):
//   POST https://queue.fal.run/<model>  -> { request_id, status_url, response_url, cancel_url }
//   GET  <status_url>                   -> { status: IN_QUEUE | IN_PROGRESS | COMPLETED }
//   GET  <response_url>                 -> { video: { url } }
// Reference images must be REMOTE URLs — we pass presigned R2 URLs.
// NOTE: fal accepts ANY submit with HTTP 200 and validates IN-QUEUE; schema
// errors surface as a failed status/response, never as a submit rejection.
// There is deliberately NO fallback provider: after the transient retries a
// clip fails loudly and the existing "try again" UX is the recovery path.

/** Which product path is asking for a clip — picks the fal model + input schema. */
export type MotionRoute = "normal" | "cinematic" | "cinematic_permissive" | "lite";

type QueueSubmitResponse = {
  request_id?: string;
  status_url?: string;
  response_url?: string;
  cancel_url?: string;
  detail?: unknown;
};
type QueueStatusResponse = { status?: string; detail?: unknown };
type QueueVideoResponse = { video?: { url?: string }; videos?: { url?: string }[]; detail?: unknown };

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 180; // ~12 min ceiling per clip.

/** Per-route duration bounds (fal-validated via schema probes, 2026-07):
 *  grok ≤15s; seedance 2.0 fast 4–15s; kling v3 3–15s; seedance 1.5 (lite) 4–12s. */
const DURATION_BOUNDS: Record<MotionRoute, { min: number; max: number }> = {
  normal: { min: 1, max: 15 },
  cinematic: { min: 4, max: 15 },
  cinematic_permissive: { min: 3, max: 15 },
  lite: { min: 4, max: 12 },
};

function routeModel(route: MotionRoute): string {
  switch (route) {
    case "normal":
      return env.FAL_MOTION_MODEL;
    case "cinematic":
      return env.FAL_CINEMATIC_MODEL;
    case "cinematic_permissive":
      return env.FAL_CINEMATIC_FALLBACK_MODEL;
    case "lite":
      return env.FAL_VIDEO_MODEL;
  }
}

/** Build the model-specific input body. Schemas verified by live benchmark
 *  (grok, seedance 2.0 fast incl. end_image_url) and the fal API docs (kling:
 *  start_image_url/end_image_url, generate_audio defaults TRUE so we must
 *  switch it off — silent is ~33% cheaper and we mux the song ourselves). */
function routeInput(
  route: MotionRoute,
  opts: {
    prompt: string;
    firstFrameUrl: string;
    lastFrameUrl?: string;
    aspectRatio: AspectRatio;
    durationSeconds: number;
  },
): Record<string, unknown> {
  const { min, max } = DURATION_BOUNDS[route];
  const duration = String(Math.min(max, Math.max(min, Math.round(opts.durationSeconds))));
  switch (route) {
    case "normal":
      return {
        prompt: opts.prompt,
        image_url: opts.firstFrameUrl,
        aspect_ratio: opts.aspectRatio,
        duration,
        resolution: "720p",
      };
    case "cinematic":
      return {
        prompt: opts.prompt,
        image_url: opts.firstFrameUrl,
        ...(opts.lastFrameUrl ? { end_image_url: opts.lastFrameUrl } : {}),
        aspect_ratio: opts.aspectRatio,
        duration,
        resolution: "480p",
        generate_audio: false,
        camera_fixed: false,
      };
    case "cinematic_permissive":
      return {
        prompt: opts.prompt,
        start_image_url: opts.firstFrameUrl,
        ...(opts.lastFrameUrl ? { end_image_url: opts.lastFrameUrl } : {}),
        aspect_ratio: opts.aspectRatio,
        duration,
        generate_audio: false,
      };
    case "lite":
      return {
        prompt: opts.prompt,
        image_url: opts.firstFrameUrl,
        aspect_ratio: opts.aspectRatio,
        duration,
        resolution: "480p", // silent 480p is the whole point of the Lite tier
        generate_audio: false,
        camera_fixed: false,
      };
  }
}

async function submit(model: string, input: Record<string, unknown>): Promise<QueueSubmitResponse> {
  let lastErr = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`https://queue.fal.run/${model}`, {
        method: "POST",
        headers: { Authorization: `Key ${env.FAL_AI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (res.ok) {
        const data = (await res.json()) as QueueSubmitResponse;
        if (!data.status_url || !data.response_url) {
          throw new Error(`no queue urls: ${JSON.stringify(data).slice(0, 200)}`);
        }
        return data;
      }
      lastErr = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
      if (res.status !== 429 && res.status < 500) break; // not transient → fail fast
    } catch (e) {
      lastErr = `network: ${(e as Error).message}`;
    }
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  throw new Error(`fal video submit (${model}) ${lastErr}`);
}

/** Best-effort cancel of an abandoned queue request so it can't bill later. */
function cancelQuietly(cancelUrl: string | undefined): void {
  if (!cancelUrl) return;
  void fetch(cancelUrl, {
    method: "PUT",
    headers: { Authorization: `Key ${env.FAL_AI_KEY}` },
  }).catch(() => undefined);
}

async function poll(model: string, job: QueueSubmitResponse): Promise<void> {
  const statusUrl = job.status_url ?? "";
  for (let i = 0; i < MAX_POLLS; i++) {
    try {
      const res = await fetch(statusUrl, { headers: { Authorization: `Key ${env.FAL_AI_KEY}` } });
      if (res.ok) {
        const data = (await res.json()) as QueueStatusResponse;
        const status = data.status ?? "";
        if (status === "COMPLETED") return;
        if (status !== "IN_QUEUE" && status !== "IN_PROGRESS") {
          throw new Error(
            `video generation ${status} (fal ${model}): ${JSON.stringify(data.detail ?? "").slice(0, 200)}`,
          );
        }
      }
    } catch (e) {
      // Terminal generation status is a real failure; network blips just re-poll.
      if ((e as Error).message?.startsWith("video generation ")) throw e;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  cancelQuietly(job.cancel_url); // don't leave a zombie request billing later
  throw new Error(`video generation timed out (fal ${model})`);
}

async function fetchResult(model: string, responseUrl: string): Promise<Buffer> {
  const res = await fetch(responseUrl, { headers: { Authorization: `Key ${env.FAL_AI_KEY}` } });
  if (!res.ok) {
    // fal surfaces generation errors (including content moderation) here.
    throw new Error(
      `video generation failed (fal ${model}): HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }
  const data = (await res.json()) as QueueVideoResponse;
  const url = data.video?.url ?? data.videos?.[0]?.url;
  if (!url) throw new Error(`video completed but returned no URL: ${JSON.stringify(data).slice(0, 200)}`);
  const file = await fetch(url);
  if (!file.ok) throw new Error(`video download HTTP ${file.status}`);
  return Buffer.from(await file.arrayBuffer());
}

const TRANSIENT =
  /could not be fetched|failed to fetch|fetch failed|timed out|timeout|HTTP 5\d\d|network|internal error|try again|temporarily/i;

/** Generate one image-to-video clip on fal and return its MP4 bytes. The route
 *  picks the model + schema; `lastFrameUrl` (cinematic routes) makes the model
 *  interpolate first→last for seamless scene-changing shots. Retries the whole
 *  clip on transient failures so one flaky shot doesn't sink the job; a
 *  terminal failure throws (nothing is charged, the user retries). */
export async function generateMotionClip(opts: {
  route: MotionRoute;
  prompt: string;
  firstFrameUrl: string;
  lastFrameUrl?: string;
  aspectRatio: AspectRatio;
  durationSeconds: number;
}): Promise<Buffer> {
  const model = routeModel(opts.route);
  const input = routeInput(opts.route, opts);
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const job = await submit(model, input);
      await poll(model, job);
      return await fetchResult(model, job.response_url ?? "");
    } catch (e) {
      lastErr = (e as Error).message ?? "";
      if (!TRANSIENT.test(lastErr) || attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
  throw new Error(lastErr);
}
