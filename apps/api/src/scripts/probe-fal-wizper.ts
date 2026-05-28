/**
 * Probe fal.ai's Wizper / Whisper endpoints on a local audio file. Validates
 *   (a) the FAL_AI_KEY works,
 *   (b) the wrapper returns per-word timestamps,
 *   (c) all 8 chorus reps on uploads/4.mp3 come back.
 *
 *   pnpm tsx --env-file=../../.env src/scripts/probe-fal-wizper.ts [audio_path]
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const audioPath = resolve(process.argv[2] ?? "../../uploads/4.mp3");
const key = process.env.FAL_AI_KEY ?? process.env.FAL_KEY ?? process.env.FAL_API_KEY;
if (!key) {
  console.error("FAL_AI_KEY missing from .env");
  process.exit(1);
}

console.log(`audio: ${audioPath}\n`);

// 1) Upload file to fal storage (gives a URL the model endpoint can fetch)
console.log("[1/3] uploading audio to fal storage…");
const buf = await readFile(audioPath);
// fal's upload flow: POST to /storage/upload/initiate to get a signed URL, PUT the bytes.
const initiateRes = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate", {
  method: "POST",
  headers: {
    Authorization: `Key ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    file_name: basename(audioPath),
    content_type: "audio/mpeg",
  }),
});
if (!initiateRes.ok) {
  console.error(`initiate HTTP ${initiateRes.status}: ${await initiateRes.text()}`);
  process.exit(1);
}
const initiate = (await initiateRes.json()) as { upload_url: string; file_url: string };
const putRes = await fetch(initiate.upload_url, {
  method: "PUT",
  headers: { "Content-Type": "audio/mpeg" },
  body: buf,
});
if (!putRes.ok) {
  console.error(`upload PUT HTTP ${putRes.status}: ${await putRes.text()}`);
  process.exit(1);
}
console.log(`  uploaded → ${initiate.file_url}\n`);

// 2) Submit Whisper request — chunk_level: "word" for per-word timestamps.
console.log("[2/3] calling fal-ai/whisper…");
const t0 = Date.now();
const wizperRes = await fetch("https://fal.run/fal-ai/whisper", {
  method: "POST",
  headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    audio_url: initiate.file_url,
    task: "transcribe",
    language: "en",
    chunk_level: "word",
    version: "3",
  }),
});
const wallMs = Date.now() - t0;
if (!wizperRes.ok) {
  console.error(`wizper HTTP ${wizperRes.status}: ${await wizperRes.text()}`);
  process.exit(1);
}
const data = await wizperRes.json();
console.log(`  wall: ${wallMs}ms\n`);

// 3) Inspect
console.log("[3/3] inspecting response…");
const out = data as { text?: string; chunks?: { text?: string; timestamp?: [number, number] }[] };
console.log(`  top-level keys: ${Object.keys(out).join(", ")}`);
console.log(`  full text length: ${(out.text ?? "").length} chars`);
console.log(`  chunks: ${(out.chunks ?? []).length}\n`);

console.log("--- first 20 chunks ---");
for (const c of (out.chunks ?? []).slice(0, 20)) {
  const ts = c.timestamp ? `${c.timestamp[0]?.toFixed(2)}-${c.timestamp[1]?.toFixed(2)}` : "?";
  console.log(`  ${ts.padEnd(15)}  ${JSON.stringify((c.text ?? "").trim())}`);
}

const re = /what\s*is\s*wrong\s*with\s*you/gi;
const chorusCount = ((out.text ?? "").match(re) ?? []).length;
console.log(`\nchorus reps in text: ${chorusCount} / 8`);
console.log(chorusCount >= 8 ? "✅ FULL coverage" : `⚠ partial coverage (${chorusCount}/8)`);
process.exit(0);
