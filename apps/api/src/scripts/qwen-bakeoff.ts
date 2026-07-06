import "../load-env.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "../env.js";

// One-off typography bake-off: hit fal.ai's Qwen-Image with the SAME prompt
// structure the video pipeline uses for Nano Banana (embedded lyric text as
// hero typography), at ≤1MP so fal bills $0.02/image. Saves PNGs locally for
// side-by-side review. NOT part of the product — throwaway research script.
//   pnpm --filter @syllary/api exec tsx src/scripts/qwen-bakeoff.ts <out-dir>

const MODEL = "fal-ai/qwen-image";
// 1280×720 = 921,600 px = 0.92MP → bills exactly 1MP = $0.02 (fal rounds UP
// per MP; anything over 1,000,000 px doubles the price).
const WIDTH = 1280;
const HEIGHT = 720;

const CASES: { name: string; style: string; subject: string; line: string }[] = [
  {
    name: "neon-short",
    style: "Neon-noir city night, wet asphalt reflections, cyan and magenta glow",
    subject: "a lone figure standing under a flickering streetlight in the rain",
    line: "One of us is on fire",
  },
  {
    name: "elegant-medium",
    style: "Elegant art-deco ballroom, gold foil accents, deep emerald tones",
    subject: "an empty ballroom with a single spotlight on the parquet floor",
    line: "I promised you the moon and delivered rain",
  },
  {
    name: "folk-painted",
    style: "Hand-painted folk illustration, warm gouache textures, sunflower palette",
    subject: "two silhouettes dancing barefoot in a warm kitchen at dusk",
    line: "We danced barefoot in the kitchen light",
  },
  {
    name: "photo-cinematic",
    style: "Photorealistic cinematic, anamorphic lens flare, teal-orange grade",
    subject: "a rain-streaked taxi window with city bokeh beyond it",
    line: "3AM and the city still won't sleep",
  },
  {
    name: "long-line-stress",
    style: "Dreamy watercolor wash, soft indigo night sky, drifting mist",
    subject: "an empty park bench under a fading constellation",
    line: "Every word I never said comes back to find me in the silence",
  },
];

// Attempt 2: diffusion-dialect prompt. Qwen (like most diffusion models) treats
// the prompt as scene content, not instructions — attempt 1 with the Gemini-style
// instruction prompt painted the meta-words ("hero", "16:9") into the image.
// Short, declarative, the lyric quoted exactly once.
function buildPrompt(c: (typeof CASES)[number]): string {
  return (
    `${c.style}. ${c.subject}. ` +
    `Large beautiful glowing text integrated into the scene reads "${c.line}". ` +
    `The quoted sentence is the only text in the image, perfectly legible, centered with wide margins. ` +
    `Rich depth, dramatic lighting, high detail, no faces.`
  );
}

async function main(): Promise<void> {
  if (!env.FAL_AI_KEY) throw new Error("FAL_AI_KEY not set.");
  const outDir = process.argv[2];
  if (!outDir) throw new Error("Usage: qwen-bakeoff.ts <out-dir>");
  mkdirSync(outDir, { recursive: true });

  for (const c of CASES) {
    const started = Date.now();
    // Queue API (submit → poll → result): fal.run's sync endpoint can hold the
    // connection past undici's headers timeout when the model queue is cold.
    const submit = await fetch(`https://queue.fal.run/${MODEL}`, {
      method: "POST",
      headers: { Authorization: `Key ${env.FAL_AI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: buildPrompt(c),
        image_size: { width: WIDTH, height: HEIGHT },
        num_images: 1,
        output_format: "png",
      }),
    });
    if (!submit.ok) {
      console.error(`${c.name}: submit FAILED ${submit.status} ${(await submit.text()).slice(0, 300)}`);
      continue;
    }
    const job = (await submit.json()) as { status_url?: string; response_url?: string };
    if (!job.status_url || !job.response_url) {
      console.error(`${c.name}: no status/response URL in submit response`);
      continue;
    }
    let status = "";
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2500));
      const s = await fetch(job.status_url, { headers: { Authorization: `Key ${env.FAL_AI_KEY}` } });
      status = ((await s.json()) as { status?: string }).status ?? "";
      if (status === "COMPLETED") break;
      if (status !== "IN_QUEUE" && status !== "IN_PROGRESS") {
        console.error(`${c.name}: unexpected status ${status}`);
        break;
      }
    }
    if (status !== "COMPLETED") {
      console.error(`${c.name}: timed out or failed (last status: ${status || "none"})`);
      continue;
    }
    const res = await fetch(job.response_url, { headers: { Authorization: `Key ${env.FAL_AI_KEY}` } });
    if (!res.ok) {
      console.error(`${c.name}: result fetch FAILED ${res.status}`);
      continue;
    }
    const data = (await res.json()) as { images?: { url?: string }[] };
    const url = data.images?.find((i) => i?.url)?.url;
    if (!url) {
      console.error(`${c.name}: no image URL in response`);
      continue;
    }
    const file = await fetch(url);
    const buf = Buffer.from(await file.arrayBuffer());
    const path = join(outDir, `${c.name}.png`);
    writeFileSync(path, buf);
    console.log(`${c.name}: OK ${(buf.length / 1024).toFixed(0)}KB in ${((Date.now() - started) / 1000).toFixed(1)}s → ${path}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
