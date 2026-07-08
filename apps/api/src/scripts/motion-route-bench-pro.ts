import "../load-env.js";
import { env } from "../env.js";
import { presignGet } from "../lib/r2.js";

/**
 * Pro-path speed benchmark: Seedance 2.0 fast image-to-video with first→last
 * frame interpolation (the Cinematic/Pro pipeline), OpenRouter vs fal direct.
 * 2× parallel per route — doubles as two solo samples AND tests whether
 * OpenRouter's 1-rps submit limit also throttles seedance.
 *
 *   pnpm --filter @syllary/api exec tsx src/scripts/motion-route-bench-pro.ts
 */

const FIRST_KEY =
  "video/80047f21-6dac-4635-881e-09b1c258b13e/0845e9b7-2307-4c6d-88df-c1fe72584b1e/img_0.jpg";
const LAST_KEY =
  "video/80047f21-6dac-4635-881e-09b1c258b13e/0845e9b7-2307-4c6d-88df-c1fe72584b1e/img_1.jpg";
const PROMPT =
  "Cinematic slow morph: the sleeping woman stirs gently, morning light shifts across " +
  "the bedroom toward the bright window, smooth dolly drift. Calm, seamless transition.";
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

async function benchOpenRouter(label: string, firstUrl: string, lastUrl: string): Promise<Timing> {
  const t: Timing = { route: "openrouter:seedance-2.0-fast", label, ok: false };
  const t0 = Date.now();
  try {
    const res = await fetch("https://openrouter.ai/api/v1/videos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "bytedance/seedance-2.0-fast",
        prompt: PROMPT,
        aspect_ratio: "16:9",
        duration: DURATION,
        resolution: "480p",
        generate_audio: false,
        frame_images: [
          { type: "image_url", image_url: { url: firstUrl }, frame_type: "first_frame" },
          { type: "image_url", image_url: { url: lastUrl }, frame_type: "last_frame" },
        ],
      }),
    });
    t.submitMs = Date.now() - t0;
    if (!res.ok) throw new Error(`submit HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { id?: string; polling_url?: string };
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

async function benchFal(
  label: string,
  model: string,
  firstUrl: string,
  lastUrl: string,
): Promise<Timing> {
  const t: Timing = { route: `fal:${model}`, label, ok: false };
  const t0 = Date.now();
  try {
    const res = await fetch(`https://queue.fal.run/${model}`, {
      method: "POST",
      headers: { Authorization: `Key ${env.FAL_AI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: PROMPT,
        image_url: firstUrl,
        end_image_url: lastUrl,
        duration: String(DURATION),
        resolution: "480p",
        aspect_ratio: "16:9",
        generate_audio: false,
        camera_fixed: false,
      }),
    });
    t.submitMs = Date.now() - t0;
    if (!res.ok) throw new Error(`submit HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
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
    if (!data.video?.url) throw new Error(`no video url: ${JSON.stringify(data).slice(0, 300)}`);
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

/** Find the working fal slug for Seedance 2.0 fast i2v (404 = wrong slug). */
async function probeFalSeedance(): Promise<string | null> {
  const candidates = [
    "bytedance/seedance-2.0/fast/image-to-video",
    "fal-ai/bytedance/seedance/v2/fast/image-to-video",
    "fal-ai/bytedance/seedance-2.0/fast/image-to-video",
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
    "route".padEnd(50) +
      "label".padEnd(12) +
      "submit".padEnd(9) +
      "queue".padEnd(9) +
      "generate".padEnd(10) +
      "download".padEnd(10) +
      "TOTAL".padEnd(9) +
      "result",
  );
  for (const r of rows) {
    console.log(
      r.route.padEnd(50) +
        r.label.padEnd(12) +
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
  if (!env.FAL_AI_KEY) throw new Error("FAL_AI_KEY not set");
  const firstUrl = await presignGet(FIRST_KEY);
  const lastUrl = await presignGet(LAST_KEY);
  const head = await fetch(firstUrl);
  if (!head.ok) throw new Error(`frame not fetchable (HTTP ${head.status})`);
  console.log("frames OK. Starting PRO bench (seedance 2.0 fast, first→last, 6s @480p).\n");

  const results: Timing[] = [];

  console.log("--- OpenRouter seedance-2.0-fast 2× parallel ---");
  const orPar = await Promise.all([
    benchOpenRouter("par-1of2", firstUrl, lastUrl),
    benchOpenRouter("par-2of2", firstUrl, lastUrl),
  ]);
  results.push(...orPar);
  printTable(results);

  console.log("\n--- probing fal for seedance 2.0 fast ---");
  const slug = await probeFalSeedance();
  if (slug) {
    console.log(`\n--- fal ${slug} 2× parallel ---`);
    const falPar = await Promise.all([
      benchFal("par-1of2", slug, firstUrl, lastUrl),
      benchFal("par-2of2", slug, firstUrl, lastUrl),
    ]);
    results.push(...falPar);
  } else {
    console.log("no working fal seedance 2.0 fast slug found.");
  }

  printTable(results);
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
