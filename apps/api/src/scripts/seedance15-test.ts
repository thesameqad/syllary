import "../load-env.js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "../env.js";

// One-off: test Seedance 1.5 Pro i2v (fal queue API) at 480p/4s/silent on a
// Qwen backdrop with embedded lyric text — does the typography survive motion?
// Throwaway research script, mirrors the Living Scenes motion-prompt style.
//   pnpm --filter @syllary/api exec tsx src/scripts/seedance15-test.ts <image.png> <out-dir>

const MODEL = "fal-ai/bytedance/seedance/v1.5/pro/image-to-video";

const PROMPT =
  "Gentle, dreamy living-scene motion: the spotlight beams sway softly, dust motes drift " +
  "through the light, subtle shimmer on the gold art-deco trim, the parquet floor catches " +
  "moving reflections. Slow, minimal camera drift. The starting frame already has the song " +
  "lyric rendered into the scene as styled glowing typography. Keep that lyric text legible, " +
  "sharp, and stable as the scene moves — let it glow or shimmer with the scene but never " +
  "warp it into gibberish, and do NOT add, duplicate, or invent any other text.";

async function main(): Promise<void> {
  if (!env.FAL_AI_KEY) throw new Error("FAL_AI_KEY not set.");
  const [imgPath, outDir] = [process.argv[2], process.argv[3]];
  if (!imgPath || !outDir) throw new Error("Usage: seedance15-test.ts <image.png> <out-dir>");

  const dataUri = `data:image/png;base64,${readFileSync(imgPath).toString("base64")}`;
  const t0 = Date.now();
  const submit = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${env.FAL_AI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: PROMPT,
      image_url: dataUri,
      resolution: "480p",
      duration: "4",
      aspect_ratio: "16:9",
      generate_audio: false,
      camera_fixed: false,
    }),
  });
  if (!submit.ok) throw new Error(`submit ${submit.status}: ${(await submit.text()).slice(0, 400)}`);
  const job = (await submit.json()) as { status_url?: string; response_url?: string };
  if (!job.status_url || !job.response_url) throw new Error("no queue URLs in submit response");

  let status = "";
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const s = await fetch(job.status_url, { headers: { Authorization: `Key ${env.FAL_AI_KEY}` } });
    status = ((await s.json()) as { status?: string }).status ?? "";
    if (status === "COMPLETED") break;
    if (status !== "IN_QUEUE" && status !== "IN_PROGRESS") throw new Error(`status ${status}`);
  }
  if (status !== "COMPLETED") throw new Error(`timed out (last: ${status})`);

  const res = await fetch(job.response_url, { headers: { Authorization: `Key ${env.FAL_AI_KEY}` } });
  const data = (await res.json()) as { video?: { url?: string } };
  if (!data.video?.url) throw new Error(`no video url: ${JSON.stringify(data).slice(0, 300)}`);
  const file = await fetch(data.video.url);
  const buf = Buffer.from(await file.arrayBuffer());
  const out = join(outDir, "seedance15-480p.mp4");
  writeFileSync(out, buf);
  console.log(`OK ${(buf.length / 1024).toFixed(0)}KB in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
