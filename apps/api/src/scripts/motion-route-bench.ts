import "../load-env.js";
import { env } from "../env.js";
import { presignGet } from "../lib/r2.js";

/**
 * Speed benchmark: is OpenRouter slowing down (or failing) motion-clip generation,
 * and does parallelism degrade per-clip latency?
 *
 * Phases measured per clip:
 *   submit   — HTTP round-trip to create the job
 *   queue    — job created → provider starts working (status leaves pending/IN_QUEUE)
 *   generate — working → completed
 *   download — fetch the finished MP4
 *
 * Runs (all on the SAME real production frame, same prompt, 6s @ 720p 16:9):
 *   1. OpenRouter x-ai/grok-imagine-video — solo ×2
 *   2. OpenRouter x-ai/grok-imagine-video — 3 in parallel
 *   3. fal.ai grok-imagine i2v (direct host) — probe slugs; if found: solo + 3 parallel
 *
 *   pnpm --filter @syllary/api exec tsx src/scripts/motion-route-bench.ts
 */

const IMAGE_KEY =
  "video/80047f21-6dac-4635-881e-09b1c258b13e/0845e9b7-2307-4c6d-88df-c1fe72584b1e/img_0.jpg";
const PROMPT =
  "Gentle living-scene motion: the woman shifts slightly as she rests, soft TV light " +
  "flickers across the room, subtle camera drift. Natural, calm, cinematic.";
const DURATION = 6;
const POLL_MS = 2000;
const CLIP_TIMEOUT_MS = 12 * 60_000;

type Timing = {
  route: string;
  label: string;
  ok: boolean;
  submitMs?: number;
  queueMs?: number;
  generateMs?: number;
  downloadMs?: number;
  totalMs?: number;
  bytes?: number;
  error?: string;
  statusLog?: string;
};

function ms(n?: number): string {
  return n === undefined ? "—" : `${(n / 1000).toFixed(1)}s`;
}

async function benchOpenRouter(label: string, imageUrl: string): Promise<Timing> {
  const t: Timing = { route: "openrouter", label, ok: false };
  const t0 = Date.now();
  try {
    const res = await fetch("https://openrouter.ai/api/v1/videos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "x-ai/grok-imagine-video",
        prompt: PROMPT,
        aspect_ratio: "16:9",
        duration: DURATION,
        resolution: "720p",
        generate_audio: false,
        frame_images: [
          { type: "image_url", image_url: { url: imageUrl }, frame_type: "first_frame" },
        ],
      }),
    });
    t.submitMs = Date.now() - t0;
    if (!res.ok) throw new Error(`submit HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { id?: string; polling_url?: string; status?: string };
    const pollUrl =
      data.polling_url ?? (data.id ? `https://openrouter.ai/api/v1/videos/${data.id}` : null);
    if (!pollUrl) throw new Error(`no polling url: ${JSON.stringify(data).slice(0, 200)}`);

    const tSubmitted = Date.now();
    let tWorking: number | undefined;
    let videoUrl = "";
    const seen: string[] = [];
    const deadline = Date.now() + CLIP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const p = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      });
      if (!p.ok) continue;
      const pd = (await p.json()) as {
        status?: string;
        unsigned_urls?: string[];
        error?: { message?: string } | string;
      };
      const status = pd.status ?? "?";
      if (seen[seen.length - 1] !== status) seen.push(status);
      if (status !== "pending" && tWorking === undefined) tWorking = Date.now();
      if (status === "completed") {
        videoUrl = pd.unsigned_urls?.[0] ?? "";
        break;
      }
      if (status === "failed" || status === "cancelled" || status === "expired") {
        const e = pd.error;
        throw new Error(`generation ${status}: ${typeof e === "string" ? e : (e?.message ?? "")}`);
      }
    }
    t.statusLog = seen.join("→");
    if (!videoUrl) throw new Error(`timed out or no url (statuses: ${seen.join("→")})`);
    const tDone = Date.now();
    t.queueMs = (tWorking ?? tDone) - tSubmitted;
    t.generateMs = tDone - (tWorking ?? tSubmitted);

    const d0 = Date.now();
    const dl = await fetch(videoUrl, {
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
    });
    if (!dl.ok) throw new Error(`download HTTP ${dl.status}`);
    const buf = Buffer.from(await dl.arrayBuffer());
    t.downloadMs = Date.now() - d0;
    t.bytes = buf.length;
    t.totalMs = Date.now() - t0;
    t.ok = true;
  } catch (e) {
    t.error = (e as Error).message;
    t.totalMs = Date.now() - t0;
  }
  return t;
}

async function benchFal(label: string, model: string, imageUrl: string): Promise<Timing> {
  const t: Timing = { route: `fal:${model}`, label, ok: false };
  const t0 = Date.now();
  try {
    const res = await fetch(`https://queue.fal.run/${model}`, {
      method: "POST",
      headers: { Authorization: `Key ${env.FAL_AI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: PROMPT,
        image_url: imageUrl,
        duration: String(DURATION),
        resolution: "720p",
        aspect_ratio: "16:9",
      }),
    });
    t.submitMs = Date.now() - t0;
    if (!res.ok) throw new Error(`submit HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const job = (await res.json()) as { status_url?: string; response_url?: string };
    if (!job.status_url || !job.response_url) throw new Error("no queue URLs");

    const tSubmitted = Date.now();
    let tWorking: number | undefined;
    const seen: string[] = [];
    const deadline = Date.now() + CLIP_TIMEOUT_MS;
    let done = false;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const s = await fetch(job.status_url, {
        headers: { Authorization: `Key ${env.FAL_AI_KEY}` },
      });
      const sd = (await s.json()) as { status?: string; queue_position?: number };
      const status =
        sd.status === "IN_QUEUE" && sd.queue_position !== undefined
          ? `IN_QUEUE#${sd.queue_position}`
          : (sd.status ?? "?");
      if (seen[seen.length - 1] !== status) seen.push(status);
      if (sd.status === "IN_PROGRESS" && tWorking === undefined) tWorking = Date.now();
      if (sd.status === "COMPLETED") {
        done = true;
        break;
      }
      if (sd.status !== "IN_QUEUE" && sd.status !== "IN_PROGRESS") {
        throw new Error(`status ${sd.status}`);
      }
    }
    t.statusLog = seen.join("→");
    if (!done) throw new Error(`timed out (statuses: ${seen.join("→")})`);
    const tDone = Date.now();
    t.queueMs = (tWorking ?? tDone) - tSubmitted;
    t.generateMs = tDone - (tWorking ?? tSubmitted);

    const d0 = Date.now();
    const r = await fetch(job.response_url, {
      headers: { Authorization: `Key ${env.FAL_AI_KEY}` },
    });
    const data = (await r.json()) as { video?: { url?: string } };
    if (!data.video?.url) throw new Error(`no video url: ${JSON.stringify(data).slice(0, 200)}`);
    const dl = await fetch(data.video.url);
    const buf = Buffer.from(await dl.arrayBuffer());
    t.downloadMs = Date.now() - d0;
    t.bytes = buf.length;
    t.totalMs = Date.now() - t0;
    t.ok = true;
  } catch (e) {
    t.error = (e as Error).message;
    t.totalMs = Date.now() - t0;
  }
  return t;
}

/** Find a working fal slug for grok-imagine image-to-video (404 = wrong slug;
 *  422 = slug exists, input schema mismatch — still counts as "exists"). */
async function probeFalGrok(): Promise<string | null> {
  const candidates = [
    "fal-ai/grok-imagine/image-to-video",
    "fal-ai/grok-imagine-video/image-to-video",
    "fal-ai/grok-imagine/video",
    "xai/grok-imagine/image-to-video",
  ];
  for (const slug of candidates) {
    const res = await fetch(`https://queue.fal.run/${slug}`, {
      method: "POST",
      headers: { Authorization: `Key ${env.FAL_AI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    console.log(`probe ${slug} → HTTP ${res.status}`);
    if (res.status !== 404) return slug;
  }
  return null;
}

function printTable(rows: Timing[]): void {
  console.log("\n=== RESULTS ===");
  console.log(
    "route".padEnd(44) +
      "label".padEnd(14) +
      "submit".padEnd(9) +
      "queue".padEnd(9) +
      "generate".padEnd(10) +
      "download".padEnd(10) +
      "TOTAL".padEnd(9) +
      "result",
  );
  for (const r of rows) {
    console.log(
      r.route.padEnd(44) +
        r.label.padEnd(14) +
        ms(r.submitMs).padEnd(9) +
        ms(r.queueMs).padEnd(9) +
        ms(r.generateMs).padEnd(10) +
        ms(r.downloadMs).padEnd(10) +
        ms(r.totalMs).padEnd(9) +
        (r.ok ? `OK ${((r.bytes ?? 0) / 1024).toFixed(0)}KB` : `FAIL: ${r.error}`),
    );
    if (r.statusLog) console.log(`  status: ${r.statusLog}`);
  }
}

async function main(): Promise<void> {
  if (!env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not set");
  const imageUrl = await presignGet(IMAGE_KEY);
  const head = await fetch(imageUrl);
  if (!head.ok) throw new Error(`frame image not fetchable (HTTP ${head.status}) — R2 creds?`);
  console.log(`frame image OK (${head.headers.get("content-length")} bytes). Starting bench.\n`);

  const results: Timing[] = [];

  console.log("--- OpenRouter solo #1 ---");
  results.push(await benchOpenRouter("solo-1", imageUrl));
  printTable(results);

  console.log("\n--- OpenRouter solo #2 ---");
  results.push(await benchOpenRouter("solo-2", imageUrl));
  printTable(results);

  console.log("\n--- OpenRouter 3× parallel ---");
  const par = await Promise.all([
    benchOpenRouter("par-1of3", imageUrl),
    benchOpenRouter("par-2of3", imageUrl),
    benchOpenRouter("par-3of3", imageUrl),
  ]);
  results.push(...par);
  printTable(results);

  if (env.FAL_AI_KEY) {
    console.log("\n--- probing fal for grok-imagine video ---");
    const slug = await probeFalGrok();
    if (slug) {
      console.log(`\n--- fal ${slug} solo ---`);
      results.push(await benchFal("solo-1", slug, imageUrl));
      console.log(`\n--- fal ${slug} 3× parallel ---`);
      const fpar = await Promise.all([
        benchFal("par-1of3", slug, imageUrl),
        benchFal("par-2of3", slug, imageUrl),
        benchFal("par-3of3", slug, imageUrl),
      ]);
      results.push(...fpar);
    } else {
      console.log("fal does not host grok-imagine video — skipping cross-route comparison.");
    }
  }

  printTable(results);
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
