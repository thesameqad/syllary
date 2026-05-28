/**
 * Probe Groq's whisper-large-v3 / whisper-large-v3-turbo on a local audio
 * file. Goal: verify it (a) catches all 8 chorus reps on uploads/4.mp3, and
 * (b) returns per-word timestamps via response_format=verbose_json +
 * timestamp_granularities=["word","segment"].
 *
 *   pnpm tsx --env-file=../../.env src/scripts/probe-groq-whisper.ts <audio_path> [model]
 *
 * Reads either GROQ_API_KEY or GROG_API_KEY (in case of typo) from .env.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const audioPath = process.argv[2];
const model = process.argv[3] ?? "whisper-large-v3";
if (!audioPath) {
  console.error("usage: tsx src/scripts/probe-groq-whisper.ts <audio_path> [model]");
  process.exit(1);
}

const apiKey = process.env.GROQ_API_KEY ?? process.env.GROG_API_KEY;
if (!apiKey) {
  console.error("No GROQ_API_KEY (or GROG_API_KEY) found in env.");
  process.exit(1);
}

const audioBuf = await readFile(resolve(audioPath));
console.log(`audio: ${audioPath} (${(audioBuf.byteLength / 1024).toFixed(1)} KB)`);
console.log(`model: ${model}\n`);

type Variant = {
  label: string;
  model: string;
  fields: [string, string][];
};

const variants: Variant[] = [
  {
    label: "v3_baseline",
    model: "whisper-large-v3",
    fields: [["temperature", "0"]],
  },
  {
    label: "v3_with_prompt",
    model: "whisper-large-v3",
    fields: [
      ["temperature", "0"],
      [
        "prompt",
        "A song with a chorus that repeats the same line many times. Transcribe every repetition.",
      ],
    ],
  },
  {
    label: "v3_temp_0.4",
    model: "whisper-large-v3",
    fields: [["temperature", "0.4"]],
  },
  {
    label: "v3_turbo",
    model: "whisper-large-v3-turbo",
    fields: [["temperature", "0"]],
  },
  {
    label: "v3_turbo_with_prompt",
    model: "whisper-large-v3-turbo",
    fields: [
      ["temperature", "0"],
      [
        "prompt",
        "A song with a chorus that repeats the same line many times. Transcribe every repetition.",
      ],
    ],
  },
];

const re = /what\s*is\s*wrong\s*with\s*you/gi;
const summary: { label: string; segments: number; chorus: number; wallMs: number }[] = [];

for (const v of variants) {
  console.log(`=== ${v.label} (${v.model}) ===`);
  const form = new FormData();
  form.append("file", new Blob([audioBuf]), basename(audioPath));
  form.append("model", v.model);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("timestamp_granularities[]", "word");
  form.append("language", "en");
  for (const [k, val] of v.fields) form.append(k, val);

  const t0 = Date.now();
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const wallMs = Date.now() - t0;
  if (!res.ok) {
    console.error(`  HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    summary.push({ label: v.label, segments: 0, chorus: 0, wallMs });
    continue;
  }
  const data = await res.json();
  const outPath = resolve(__dirname, "..", "..", "debug", `groq-${v.label}.json`);
  await import("node:fs/promises").then((fs) => fs.writeFile(outPath, JSON.stringify(data, null, 2)));
  const segments = Array.isArray(data.segments) ? data.segments : [];
  const words = Array.isArray(data.words) ? data.words : [];
  let chorus = 0;
  for (const s of segments) {
    const m = (s.text ?? "").match(re);
    if (m) chorus += m.length;
  }
  console.log(`  wall: ${wallMs}ms, segments: ${segments.length}, words: ${words.length}, chorus reps: ${chorus}/8`);
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    console.log(`    L${i.toString().padStart(2)}  ${Number(s.start).toFixed(2).padStart(6)}s – ${Number(s.end).toFixed(2).padStart(6)}s  ${JSON.stringify((s.text ?? "").trim())}`);
  }
  console.log();
  summary.push({ label: v.label, segments: segments.length, chorus, wallMs });
}

console.log("=== Scoreboard ===");
console.log("(truth: 8 chorus reps in 4.mp3)");
for (const s of summary) {
  const mark = s.chorus >= 8 ? "✅ FULL" : `⚠ ${s.chorus}/8`;
  console.log(`  ${s.label.padEnd(28)}  wall=${String(s.wallMs).padStart(5)}ms  segs=${String(s.segments).padStart(3)}  ${mark}`);
}
process.exit(0);
