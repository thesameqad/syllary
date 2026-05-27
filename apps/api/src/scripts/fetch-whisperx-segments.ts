/**
 * One-off: fetch WhisperX segment-level timestamps for a given song.
 *
 * Calls `victor-upmeet/whisperx-a40-large` on the song's R2 audio file with
 * `align_output: false` (so we get segments + texts without the costly
 * wav2vec2 word-level pass), polls until done, writes the segments to
 * cog/mms-aligner/whisperx-segments.json.
 *
 * Used by test-mms-segment-aligned.ts to set per-line audio chunk boundaries.
 *
 *   Usage:
 *     node --import ./apps/api/node_modules/tsx/dist/loader.mjs --env-file=.env \
 *       apps/api/src/scripts/fetch-whisperx-segments.ts 3.mp3
 */
import "dotenv/config";
import Replicate from "replicate";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { desc, eq, ilike, or } from "drizzle-orm";

import { db } from "../db/client.js";
import { songs } from "../db/schema.js";
import { env } from "../env.js";
import { presignGet } from "../lib/r2.js";

const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const filename = process.argv[2] ?? "3.mp3";

const [row] = await db
  .select()
  .from(songs)
  .where(or(eq(songs.originalFilename, filename), ilike(songs.originalFilename, `%${filename}%`)))
  .orderBy(desc(songs.createdAt))
  .limit(1);

if (!row) throw new Error(`No song row found matching ${filename}`);

console.error(`Song ${row.id}  file=${row.originalFilename}  r2Key=${row.r2Key}`);
const audioUrl = await presignGet(row.r2Key);
console.error(`Presigned audio URL: ${audioUrl.slice(0, 100)}…`);

const replicate = new Replicate({ auth: env.REPLICATE_API_TOKEN });
const model = await replicate.models.get("victor-upmeet", "whisperx-a40-large");
const version = model.latest_version?.id;
if (!version) throw new Error("Could not resolve whisperx-a40-large version");

console.error("Creating WhisperX prediction (align_output: false)…");
const prediction = await replicate.predictions.create({
  version,
  input: {
    audio_file: audioUrl,
    align_output: false,
    vad_onset: 0.05,
    vad_offset: 0.05,
    language: "en",
    temperature: 0,
  },
});
console.error(`Prediction ${prediction.id} created. Polling every 3s…`);

let p = prediction;
const t0 = Date.now();
while (p.status === "starting" || p.status === "processing") {
  await new Promise((r) => setTimeout(r, 3000));
  p = await replicate.predictions.get(p.id);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  console.error(`  +${elapsed}s status=${p.status}`);
}

if (p.status !== "succeeded") {
  throw new Error(`Prediction failed: status=${p.status} error=${p.error}`);
}

type WhisperxSegment = { start?: number; end?: number; text?: string };
const out = (p.output ?? {}) as { segments?: WhisperxSegment[]; detected_language?: string };
const segments = (out.segments ?? [])
  .map((s) => ({
    start: typeof s.start === "number" ? s.start : 0,
    end: typeof s.end === "number" ? s.end : 0,
    text: typeof s.text === "string" ? s.text.trim() : "",
  }))
  .filter((s) => s.text.length > 0);

if (segments.length === 0) throw new Error("WhisperX returned no segments");

const outPath = join(REPO_ROOT, "cog", "mms-aligner", "whisperx-segments.json");
writeFileSync(
  outPath,
  JSON.stringify({ songId: row.id, language: out.detected_language ?? null, segments }, null, 2),
);

console.error(`Wrote ${segments.length} segments → ${outPath}`);
console.error(`First segment: ${segments[0]!.start.toFixed(2)}–${segments[0]!.end.toFixed(2)} "${segments[0]!.text.slice(0, 60)}"`);
console.error(`Last  segment: ${segments.at(-1)!.start.toFixed(2)}–${segments.at(-1)!.end.toFixed(2)} "${segments.at(-1)!.text.slice(0, 60)}"`);

// Postgres pool keeps the Node event loop alive — force exit so pipelines
// (and `tail -N` consumers) don't hang.
process.exit(0);
