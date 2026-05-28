/**
 * Run several Replicate Whisper-family wrappers against the same vocals URL
 * and dump their outputs side by side. Goal: find one that returns all 8
 * "What is wrong with you?" reps on uploads/4.mp3, the way local WhisperX
 * does, instead of dropping the middle ~14s like victor-upmeet/whisperx.
 *
 *   pnpm tsx --env-file=../../.env src/scripts/probe-replicate-wrappers.ts <vocalsUrl>
 *
 * Pass the Demucs vocals URL for the test song (we already saved one in
 * apps/api/debug/<songId>/01-demucs-output.json from a previous trace).
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Replicate from "replicate";
import { env } from "../env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const replicate = new Replicate({ auth: env.REPLICATE_API_TOKEN });

const vocalsUrl = process.argv[2];
if (!vocalsUrl) {
  console.error("usage: tsx src/scripts/probe-replicate-wrappers.ts <vocalsUrl>");
  process.exit(1);
}

const outDir = resolve(__dirname, "..", "..", "debug", "wrapper-shootout");
await mkdir(outDir, { recursive: true });

/** A candidate Whisper-family wrapper to test. `parse` converts the wrapper's
 *  output into a uniform `{ text, start, end }` segment list so we can score
 *  them apples-to-apples. */
type Candidate = {
  label: string;
  slug: `${string}/${string}`;
  input: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse: (output: any) => { text: string; start: number; end: number }[];
};

const candidates: Candidate[] = [
  {
    label: "victor-upmeet_whisperx",
    slug: "victor-upmeet/whisperx",
    input: {
      audio_file: vocalsUrl,
      align_output: true,
      vad_onset: 0.05,
      vad_offset: 0.363,
      language: "en",
      temperature: 0,
    },
    parse: (o) =>
      (o?.segments ?? []).map((s: { text?: string; start?: number; end?: number }) => ({
        text: (s.text ?? "").trim(),
        start: s.start ?? 0,
        end: s.end ?? 0,
      })),
  },
  // a40-large excluded: same wrapper code as victor-upmeet/whisperx (just a
  // bigger Whisper model), and cold-boots forever on Replicate's free tier.
  {
    label: "vaibhavs10_incredibly-fast-whisper",
    slug: "vaibhavs10/incredibly-fast-whisper",
    input: {
      audio: vocalsUrl,
      task: "transcribe",
      language: "english",
      timestamp: "chunk", // 'chunk' or 'word'
      batch_size: 24,
      diarise_audio: false,
    },
    parse: (o) => {
      // Wrapper returns `{ chunks: [{ text, timestamp: [start, end] }, ...] }`
      const chunks = o?.chunks ?? o?.output?.chunks ?? [];
      return chunks.map(
        (c: { text?: string; timestamp?: [number, number] }) => ({
          text: (c.text ?? "").trim(),
          start: c.timestamp?.[0] ?? 0,
          end: c.timestamp?.[1] ?? 0,
        }),
      );
    },
  },
  {
    label: "openai_whisper",
    slug: "openai/whisper",
    input: {
      audio: vocalsUrl,
      model: "large-v3",
      language: "en",
      temperature: 0,
      condition_on_previous_text: false,
    },
    parse: (o) => {
      const segs = o?.segments ?? [];
      return segs.map((s: { text?: string; start?: number; end?: number }) => ({
        text: (s.text ?? "").trim(),
        start: s.start ?? 0,
        end: s.end ?? 0,
      }));
    },
  },
  {
    label: "thomasmol_whisper-diarization",
    slug: "thomasmol/whisper-diarization",
    input: {
      file_url: vocalsUrl,
      language: "en",
      num_speakers: 1,
    },
    parse: (o) => {
      const segs = o?.segments ?? [];
      return segs.map((s: { text?: string; start?: number; end?: number }) => ({
        text: (s.text ?? "").trim(),
        start: s.start ?? 0,
        end: s.end ?? 0,
      }));
    },
  },
];

async function getVersion(slug: `${string}/${string}`): Promise<string | null> {
  const [owner, name] = slug.split("/") as [string, string];
  try {
    const m = await replicate.models.get(owner, name);
    return m.latest_version?.id ?? null;
  } catch (e) {
    console.error(`  could not resolve ${slug}: ${(e as Error).message}`);
    return null;
  }
}

async function waitFor(id: string): Promise<{ status: string; output: unknown; error: string | null }> {
  for (;;) {
    const p = await replicate.predictions.get(id);
    if (p.status === "failed" || p.status === "canceled") return { status: p.status, output: p.output, error: String(p.error ?? "") };
    if (p.status === "succeeded") return { status: p.status, output: p.output, error: null };
    await new Promise((r) => setTimeout(r, 2500));
  }
}

function countChorusReps(segments: { text: string }[]): number {
  // Score: how many of the segment texts contain the chorus phrase.
  const re = /what\s*is\s*wrong\s*with\s*you/gi;
  let n = 0;
  for (const s of segments) {
    const matches = s.text.match(re);
    if (matches) n += matches.length;
  }
  return n;
}

console.log(`vocals url: ${vocalsUrl.slice(0, 80)}…\n`);
console.log("Truth: 8 chorus repetitions in 4.mp3 (7, 11, 14, 19, 23, 27, 30, 34s)\n");

const results: { label: string; segments: number; chorus: number; ok: boolean; error?: string }[] = [];

for (const cand of candidates) {
  console.log(`=== ${cand.label} (${cand.slug}) ===`);
  const version = await getVersion(cand.slug);
  if (!version) {
    results.push({ label: cand.label, segments: 0, chorus: 0, ok: false, error: "not found" });
    continue;
  }

  let predId: string;
  try {
    const p = await replicate.predictions.create({ version, input: cand.input });
    predId = p.id;
  } catch (e) {
    const msg = (e as Error).message;
    console.error("  create failed:", msg.slice(0, 200));
    results.push({ label: cand.label, segments: 0, chorus: 0, ok: false, error: `create: ${msg.slice(0, 80)}` });
    // Wait a moment so we don't compound 429s on the next.
    await new Promise((r) => setTimeout(r, 8000));
    continue;
  }

  console.log("  prediction:", predId);
  const result = await waitFor(predId);
  if (result.status !== "succeeded") {
    console.error("  prediction failed:", result.error?.slice(0, 200));
    results.push({ label: cand.label, segments: 0, chorus: 0, ok: false, error: result.error ?? "failed" });
    await writeFile(resolve(outDir, `${cand.label}.json`), JSON.stringify({ error: result.error, output: result.output }, null, 2));
    continue;
  }

  await writeFile(resolve(outDir, `${cand.label}.json`), JSON.stringify(result.output, null, 2));

  let segs: { text: string; start: number; end: number }[];
  try {
    segs = cand.parse(result.output);
  } catch (e) {
    console.error("  parse failed:", (e as Error).message);
    results.push({ label: cand.label, segments: 0, chorus: 0, ok: false, error: `parse: ${(e as Error).message}` });
    continue;
  }
  const chorus = countChorusReps(segs);
  console.log(`  segments: ${segs.length},  chorus reps in text: ${chorus}`);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    console.log(`    L${i.toString().padStart(2)}  ${s.start.toFixed(2).padStart(6)}s – ${s.end.toFixed(2).padStart(6)}s  ${JSON.stringify(s.text)}`);
  }
  results.push({ label: cand.label, segments: segs.length, chorus, ok: true });
  // Pause between wrappers to dodge the free-tier 6 RPM rate limit.
  await new Promise((r) => setTimeout(r, 12000));
  console.log();
}

console.log("\n=== Scoreboard ===");
console.log("(truth = 8 chorus reps)");
console.log("");
for (const r of results) {
  const status = !r.ok ? `❌ ${r.error}` : r.chorus >= 8 ? "✅ FULL" : `⚠ partial (${r.chorus}/8)`;
  console.log(`  ${r.label.padEnd(42)}  segs=${String(r.segments).padStart(3)}  chorus=${r.chorus}  ${status}`);
}
console.log(`\nDumps in: ${outDir}`);
process.exit(0);
