/**
 * Re-run the FAST-mode lyrics pipeline against an existing song's audio and
 * dump every intermediate stage to disk so we can pinpoint which stage is
 * dropping or mistiming lines (Demucs vs WhisperX vs structureLyrics vs
 * alignLines).
 *
 *   pnpm tsx --env-file=../../.env src/scripts/trace-fast-pipeline.ts <songId>
 *
 * Costs roughly one Demucs + one WhisperX call (~$0.012). Does NOT touch the
 * DB. Outputs land in apps/api/debug/<songId>/.
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { songs } from "../db/schema.js";
import { presignGet } from "../lib/r2.js";
import { getPrediction, startSeparation, vocalsUrlFromOutput } from "../lib/replicate.js";
import { mapWhisperx } from "../lib/transcript.js";
import { structureLyrics } from "../lib/openrouter.js";
import { alignLines } from "../lib/transcript.js";
import Replicate from "replicate";
import { env } from "../env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const replicate = new Replicate({ auth: env.REPLICATE_API_TOKEN });

const songId = process.argv[2];
if (!songId) {
  console.error("usage: tsx src/scripts/trace-fast-pipeline.ts <songId>");
  process.exit(1);
}

const debugDir = resolve(__dirname, "..", "..", "debug", songId);
await mkdir(debugDir, { recursive: true });
const dump = async (name: string, data: unknown) => {
  await writeFile(resolve(debugDir, `${name}.json`), JSON.stringify(data, null, 2));
  console.log(`  wrote ${name}.json`);
};

console.log(`[1/8] Looking up song ${songId}…`);
const [row] = await db.select().from(songs).where(eq(songs.id, songId)).limit(1);
if (!row) {
  console.error("song not found");
  process.exit(1);
}
const audioUrl = await presignGet(row.r2Key);
console.log(`  duration: ${row.durationSeconds}s, r2Key: ${row.r2Key}`);

console.log("[2/8] Starting Demucs (fast mode)…");
const demucsId = await startSeparation(audioUrl, "fast");
console.log(`  demucs prediction id: ${demucsId}`);

async function waitFor(id: string): Promise<unknown> {
  for (;;) {
    const p = await getPrediction(id);
    if (p.status === "failed" || p.status === "canceled") {
      throw new Error(p.error ?? "prediction failed");
    }
    if (p.status === "succeeded") return p.output;
    await new Promise((r) => setTimeout(r, 2500));
  }
}

console.log("[3/8] Waiting for Demucs…");
const demucsOutput = await waitFor(demucsId);
await dump("01-demucs-output", demucsOutput);
const vocalsUrl = vocalsUrlFromOutput(demucsOutput);
if (!vocalsUrl) {
  console.error("no vocals url in demucs output");
  process.exit(1);
}
console.log(`  vocals url: ${vocalsUrl.slice(0, 80)}…`);

console.log("[4/8] Starting WhisperX on vocals (fast = whisperx large-v2)…");
const whisperxModel = await replicate.models.get("victor-upmeet", "whisperx");
const whisperxVersion = whisperxModel.latest_version?.id;
if (!whisperxVersion) {
  console.error("could not resolve whisperx version");
  process.exit(1);
}
const whisperxPred = await replicate.predictions.create({
  version: whisperxVersion,
  input: {
    audio_file: vocalsUrl,
    align_output: true,
    vad_onset: 0.05,
    vad_offset: 0.05,
    language: "en",
    temperature: 0,
  },
});
console.log(`  whisperx prediction id: ${whisperxPred.id}`);

console.log("[5/8] Waiting for WhisperX…");
const whisperxOutput = await waitFor(whisperxPred.id);
await dump("02-whisperx-raw", whisperxOutput);

console.log("[6/8] mapWhisperx → rough lines…");
const rough = mapWhisperx(whisperxOutput);
await dump("03-rough-lines", rough);
console.log(`  rough lines: ${rough.lines.length}, total words: ${rough.lines.reduce((n, l) => n + l.words.length, 0)}`);

console.log("[7/8] structureLyrics (Gemini)…");
const rawTexts = rough.lines.map((l) => l.text);
await dump("04-structure-input", rawTexts);
const structured = await structureLyrics(rawTexts);
await dump("05-structure-output", structured);
if (!structured) {
  console.error("structureLyrics returned null");
  process.exit(1);
}
console.log(`  structured lines: ${structured.lines.length}, sections: ${structured.sections.length}`);

console.log("[8/8] alignLines → final timed lines…");
const allWords = rough.lines.flatMap((l) => l.words);
const aligned = alignLines(structured.lines, allWords);
await dump("06-aligned-final", aligned);

console.log("\n=== FINAL TIMED LINES ===");
for (let i = 0; i < aligned.length; i++) {
  const l = aligned[i]!;
  console.log(
    `  L${i.toString().padStart(2)} ${l.start.toFixed(2).padStart(6)}s – ${l.end.toFixed(2).padStart(6)}s  ${JSON.stringify(l.text)}`,
  );
}

console.log(`\nAll stage outputs in: ${debugDir}`);
process.exit(0);
