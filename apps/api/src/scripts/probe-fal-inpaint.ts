import "../load-env.js";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { env } from "../env.js";

// Plates discovery probe: ONE mask-constrained inpaint against a real backdrop.
// Verifies: the endpoint contract, in-mask typography quality, and whether
// pixels outside the mask stay untouched. Throwaway research script.
//   pnpm --filter @syllary/api exec tsx src/scripts/probe-fal-inpaint.ts <base.png> <out-dir>

const MODEL = "fal-ai/qwen-image-edit/inpaint";
// Attempt 2: band on the WALL (frontal surface — text reads naturally there;
// attempt 1's floor band got repainted as plain floor, text ignored). Covers
// the base's existing baked text fully so the swap is clean.
const RECT = { x: 0.16, y: 0.15, w: 0.68, h: 0.45 };
const LINE = "You said forever then you walked away";

const exec = promisify(execFile);
const require = createRequire(import.meta.url);

async function main(): Promise<void> {
  const [basePath, outDir] = [process.argv[2], process.argv[3]];
  if (!basePath || !outDir) throw new Error("Usage: probe-fal-inpaint.ts <base.png> <out-dir>");
  const ffmpeg = env.FFMPEG_PATH || (require("ffmpeg-static") as string);

  // Feathered white band on black at the base image's size (1280×720 assumed).
  const maskPath = join(outDir, "mask.png");
  const x = Math.round(1280 * RECT.x);
  const y = Math.round(720 * RECT.y);
  const w = Math.round(1280 * RECT.w);
  const h = Math.round(720 * RECT.h);
  await exec(ffmpeg, [
    "-y", "-f", "lavfi", "-i", "color=c=black:s=1280x720",
    "-vf", `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=white:t=fill,boxblur=luma_radius=20:luma_power=2`,
    "-frames:v", "1", maskPath,
  ]);

  const imageUri = `data:image/png;base64,${readFileSync(basePath).toString("base64")}`;
  const maskUri = `data:image/png;base64,${readFileSync(maskPath).toString("base64")}`;

  const t0 = Date.now();
  const submit = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${env.FAL_AI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // Content-first inpaint dialect: describe what the masked region CONTAINS
      // (attempt 1's instruction-style "change nothing else" clause won over the
      // text request and the band was filled with plain background).
      prompt:
        `Glowing elegant golden serif text on the green wall that reads "${LINE}" — ` +
        `large, perfectly legible, lit like the room, no quotation marks drawn.`,
      image_url: imageUri,
      mask_url: maskUri,
      output_format: "png",
    }),
  });
  if (!submit.ok) throw new Error(`submit ${submit.status}: ${(await submit.text()).slice(0, 400)}`);
  const job = (await submit.json()) as { status_url?: string; response_url?: string };
  if (!job.status_url || !job.response_url) throw new Error("no queue urls");

  const deadline = Date.now() + 240_000;
  let status = "";
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await fetch(job.status_url, { headers: { Authorization: `Key ${env.FAL_AI_KEY}` } });
    status = ((await s.json()) as { status?: string }).status ?? "";
    if (status === "COMPLETED") break;
    if (status !== "IN_QUEUE" && status !== "IN_PROGRESS") throw new Error(`status ${status}`);
  }
  if (status !== "COMPLETED") throw new Error(`timed out (${status})`);

  const res = await fetch(job.response_url, { headers: { Authorization: `Key ${env.FAL_AI_KEY}` } });
  if (!res.ok) throw new Error(`result ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { images?: { url?: string }[]; image?: { url?: string } };
  const url = data.images?.find((i) => i?.url)?.url ?? data.image?.url;
  if (!url) throw new Error(`no image url: ${JSON.stringify(data).slice(0, 300)}`);
  const file = await fetch(url);
  const buf = Buffer.from(await file.arrayBuffer());
  const outPath = join(outDir, "inpainted.png");
  writeFileSync(outPath, buf);
  console.log(`OK ${(buf.length / 1024).toFixed(0)}KB in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
