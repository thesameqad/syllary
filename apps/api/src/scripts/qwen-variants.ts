import "../load-env.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "../env.js";

// Research: can identical prompts produce loopable near-identical frames?
// Runs the SAME ballroom prompt twice — if composition/text differ, the
// "N images looped" idea can't hold embedded typography stable.
//   pnpm --filter @syllary/api exec tsx src/scripts/qwen-variants.ts <out-dir>

const MODEL = "fal-ai/qwen-image";
const PROMPT =
  "Elegant art-deco ballroom, gold foil accents, deep emerald tones. An empty ballroom " +
  'with a single spotlight on the parquet floor. Large beautiful glowing text integrated into the scene reads "I promised you the moon and delivered rain". ' +
  "The quoted sentence is the only text in the image, perfectly legible, centered with wide margins. " +
  "Rich depth, dramatic lighting, high detail, no faces.";

async function gen(outPath: string): Promise<void> {
  const submit = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${env.FAL_AI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: PROMPT,
      image_size: { width: 1280, height: 720 },
      num_images: 1,
      output_format: "png",
    }),
  });
  if (!submit.ok) throw new Error(`submit ${submit.status}`);
  const job = (await submit.json()) as { status_url?: string; response_url?: string };
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    const s = await fetch(job.status_url!, { headers: { Authorization: `Key ${env.FAL_AI_KEY}` } });
    const status = ((await s.json()) as { status?: string }).status;
    if (status === "COMPLETED") break;
  }
  const res = await fetch(job.response_url!, { headers: { Authorization: `Key ${env.FAL_AI_KEY}` } });
  const data = (await res.json()) as { images?: { url?: string }[] };
  const url = data.images?.find((i) => i?.url)?.url;
  if (!url) throw new Error("no image url");
  const file = await fetch(url);
  writeFileSync(outPath, Buffer.from(await file.arrayBuffer()));
  console.log(`OK → ${outPath}`);
}

async function main(): Promise<void> {
  const outDir = process.argv[2];
  if (!outDir) throw new Error("Usage: qwen-variants.ts <out-dir>");
  mkdirSync(outDir, { recursive: true });
  await gen(join(outDir, "variant-1.png"));
  await gen(join(outDir, "variant-2.png"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
