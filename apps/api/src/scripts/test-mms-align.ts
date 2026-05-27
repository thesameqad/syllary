/**
 * Validation script: re-time an existing song's Lyrics using the local
 * mms-aligner cog instead of WhisperX's bundled wav2vec2 alignment.
 *
 * Pipeline:
 *   1. Fetch the most recent row for `--song <filename>` from Supabase.
 *   2. Build a transcript = lines.map(l => l.text).join("\n") from its
 *      canonical lyric lines (output of LLM reconciliation).
 *   3. Invoke the locally-built cog image via `cog predict` (run through WSL)
 *      against the original audio in uploads/<filename>.
 *   4. Greedy text-match the MMS word stream onto the per-line tokens,
 *      producing a new Lyrics object that keeps line text + sections but
 *      replaces every word's start/end with MMS timings.
 *   5. PATCH the row's `lyrics` column with the result.
 *
 * Goal is to compare karaoke quality on a real result page WITHOUT touching
 * the orchestrator or running a fresh full Pro pipeline. If MMS clearly wins
 * here, we do the full API integration.
 *
 *   Usage (run from monorepo root, with .env loaded):
 *     node --import ./apps/api/node_modules/tsx/dist/loader.mjs --env-file=.env \
 *       apps/api/src/scripts/test-mms-align.ts 3.mp3
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { desc, eq, ilike, or } from "drizzle-orm";

import { db } from "../db/client.js";
import { songs } from "../db/schema.js";
import type { Lyrics, LyricLine, LyricWord } from "@syllary/shared";

const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const filename = process.argv[2] ?? "3.mp3";

const [row] = await db
  .select()
  .from(songs)
  .where(or(eq(songs.originalFilename, filename), ilike(songs.originalFilename, `%${filename}%`)))
  .orderBy(desc(songs.createdAt))
  .limit(1);

if (!row) throw new Error(`No song row found matching ${filename}`);
if (!row.lyrics) throw new Error(`Song ${row.id} has no lyrics yet — process it first`);

const audioPath = join(REPO_ROOT, "uploads", filename);
const lines: LyricLine[] = row.lyrics.lines;
const transcript = lines.map((l) => l.text).join("\n");

console.log(`Song ${row.id}  file=${row.originalFilename}  mode=${row.mode}`);
console.log(`Lines: ${lines.length}  transcript chars: ${transcript.length}`);

const work = mkdtempSync(join(tmpdir(), "mms-align-"));
const transcriptPath = join(work, "transcript.txt");
const outPath = join(work, "mms-out.json");
writeFileSync(transcriptPath, transcript, "utf-8");

// Run the cog through WSL. Paths are converted to /mnt/c form so the WSL-side
// cog binary can resolve them.
const toWsl = (p: string) =>
  p.replace(/^([A-Z]):/, (_, d: string) => `/mnt/${d.toLowerCase()}`).replace(/\\/g, "/");
const cogDir = `${toWsl(REPO_ROOT)}/cog/mms-aligner`;
const wslAudio = toWsl(audioPath);
const wslTranscript = toWsl(transcriptPath);
const wslOut = toWsl(outPath);

console.log(`Running cog predict (CPU build) — typical wall time ~60-90s on a 3-min track...`);
const bashCmd = `cd '${cogDir}' && ~/bin/cog predict -i audio=@'${wslAudio}' -i transcript=@'${wslTranscript}' -o '${wslOut}' > '${toWsl(join(work, "cog.log"))}' 2>&1`;
console.log(`> wsl.exe -- bash -lc "${bashCmd}"`);
await new Promise<void>((resolve, reject) => {
  const proc = spawn("wsl.exe", ["--", "bash", "-lc", bashCmd], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  proc.on("error", (e) => reject(new Error(`spawn failed: ${e.message}`)));
  proc.on("exit", (code, signal) => {
    if (code === 0) return resolve();
    // Dump the cog log on failure so we can see WHY.
    try {
      const log = readFileSync(join(work, "cog.log"), "utf-8");
      console.error(`--- cog.log (last 2000 chars) ---`);
      console.error(log.slice(-2000));
      console.error(`--- end cog.log ---`);
    } catch {}
    reject(new Error(`cog exited code=${code} signal=${signal ?? "null"}`));
  });
});

type MmsWord = { text: string; start: number; end: number; score: number };
const mmsWords = JSON.parse(readFileSync(outPath, "utf-8")) as MmsWord[];
console.log(`MMS produced ${mmsWords.length} word timestamps.`);

// Tokenize a display token the same way ctc-forced-aligner does so the
// match is direct. MMS's load_transcript lowercases each whitespace-separated
// word and drops every char not in the model dictionary (apostrophe kept,
// hyphens / dots / commas dropped). For greedy matching we just compare
// alphanumeric+apostrophe normalized forms.
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9']/g, "");

let cursor = 0;
const TOL = 0.05;
let prevMatchedEnd = -Infinity;
const newLines: LyricLine[] = [];
let unmatchedCount = 0;

for (const line of lines) {
  const tokens = line.text.split(/\s+/).filter(Boolean);
  const lineWords: { text: string; start: number | null; end: number | null }[] = tokens.map((t) => ({
    text: t,
    start: null,
    end: null,
  }));

  for (let k = 0; k < tokens.length; k++) {
    const tok = normalize(tokens[k]!);
    if (!tok) continue;
    // Greedy forward scan. Allow ~24 tokens of lookahead to accommodate the
    // occasional MMS word that doesn't normalize to an exact match (e.g.
    // "I'd" → "i'd" in tokens, sometimes "id" without apostrophe in MMS
    // output). Enforce monotonicity so we don't time-regress.
    const limit = Math.min(mmsWords.length, cursor + 24);
    for (let j = cursor; j < limit; j++) {
      const w = mmsWords[j]!;
      if (normalize(w.text) !== tok) continue;
      if (w.start < prevMatchedEnd - TOL) continue;
      lineWords[k]!.start = w.start;
      lineWords[k]!.end = w.end;
      cursor = j + 1;
      prevMatchedEnd = w.end;
      break;
    }
    if (lineWords[k]!.start === null) unmatchedCount++;
  }

  // Interpolate any unmatched gaps so `words` reconstructs `text` (matches
  // wordsCoverText invariant the player relies on).
  const firstMatched = lineWords.find((w) => w.start !== null);
  const lastMatched = [...lineWords].reverse().find((w) => w.end !== null);
  const lineStart = firstMatched?.start ?? lines.indexOf(line) === 0 ? 0 : line.start;
  const lineEnd = lastMatched?.end ?? line.end;
  let i = 0;
  while (i < lineWords.length) {
    if (lineWords[i]!.start !== null) {
      i++;
      continue;
    }
    let j = i;
    while (j < lineWords.length && lineWords[j]!.start === null) j++;
    const left = i > 0 ? lineWords[i - 1]!.end! : lineStart;
    const right = j < lineWords.length ? lineWords[j]!.start! : lineEnd;
    const span = Math.max(right - left, 0);
    const width = span / (j - i);
    for (let k = 0; k < j - i; k++) {
      lineWords[i + k]!.start = left + width * k;
      lineWords[i + k]!.end = left + width * (k + 1);
    }
    i = j;
  }

  const finalWords: LyricWord[] = lineWords.map((w) => ({
    text: w.text,
    start: w.start ?? lineStart,
    end: w.end ?? lineStart,
  }));

  // Smooth large within-line gaps. When the aligner can't lock onto a
  // sequence of words (instrumental between phrases, etc.) it ends up with
  // a cluster of words bunched at the start of the line, then a multi-second
  // gap, then the rest at the end. The pill then clings to the last word in
  // the early cluster for the entire gap. Re-distribute each pre-gap cluster
  // evenly so the highlight always walks forward. Handles multiple gaps
  // per line (a single line can have 2+ if the line is long, e.g. a chorus
  // line covering two distinct phrases with an instrumental between).
  const INTRA_GAP_THRESHOLD = 2.0;
  let clusterStart = 0;
  for (let i = 0; i < finalWords.length - 1; i++) {
    const cur = finalWords[i]!;
    const nxt = finalWords[i + 1]!;
    if (nxt.start - cur.end <= INTRA_GAP_THRESHOLD) continue;
    const stretchStart = finalWords[clusterStart]!.start;
    const stretchEnd = nxt.start - 0.1;
    const span = stretchEnd - stretchStart;
    const count = i - clusterStart + 1;
    if (span > 0 && count > 0) {
      const width = span / count;
      for (let k = 0; k < count; k++) {
        finalWords[clusterStart + k]!.start = stretchStart + width * k;
        finalWords[clusterStart + k]!.end = stretchStart + width * (k + 1);
      }
    }
    clusterStart = i + 1;
  }

  const start = finalWords[0]?.start ?? lineStart;
  const end = finalWords.at(-1)?.end ?? lineEnd;
  newLines.push({ text: line.text, start, end, words: finalWords, section: line.section });
}

console.log(
  `Re-aligned ${newLines.length} lines.  unmatched word tokens: ${unmatchedCount} ` +
    `(interpolated). cursor consumed ${cursor}/${mmsWords.length} MMS words.`,
);

// Cross-line redistribution: forced alignment on repetitive lyrics often
// puts the wrong audio chunk into the wrong line. Detect runs of consecutive
// lines where one is "over-extended" (>1 s/word, MMS overshot) and a
// neighbour is "over-compressed" (<0.25 s/word, MMS squeezed it into a
// fragment), then re-spread the run's combined span by total word count.
// Doesn't touch lines that look reasonable.
const SLOW_THRESHOLD = 1.0;
const FAST_THRESHOLD = 0.25;

function perWord(line: LyricLine) {
  return line.words.length > 0 ? (line.end - line.start) / line.words.length : 0;
}

function isImbalanced(line: LyricLine) {
  const pw = perWord(line);
  return pw > 0 && (pw > SLOW_THRESHOLD || pw < FAST_THRESHOLD);
}

let redistRuns = 0;
let i = 0;
while (i < newLines.length) {
  if (!isImbalanced(newLines[i]!)) {
    i++;
    continue;
  }
  let j = i;
  while (j + 1 < newLines.length && isImbalanced(newLines[j + 1]!)) j++;
  // Confirm the run contains BOTH slow and fast (not just one direction)
  const hasSlow = newLines.slice(i, j + 1).some((l) => perWord(l) > SLOW_THRESHOLD);
  const hasFast = newLines.slice(i, j + 1).some((l) => perWord(l) < FAST_THRESHOLD);
  if (!hasSlow || !hasFast || i === j) {
    i = j + 1;
    continue;
  }

  const runStart = newLines[i]!.start;
  const runEnd = newLines[j]!.end;
  const runSpan = runEnd - runStart;
  const totalWords = newLines.slice(i, j + 1).reduce((s, l) => s + l.words.length, 0);
  if (runSpan <= 0 || totalWords === 0) {
    i = j + 1;
    continue;
  }
  const sPerWord = runSpan / totalWords;
  let cursorT = runStart;
  for (let k = i; k <= j; k++) {
    const line = newLines[k]!;
    const lineSpan = line.words.length * sPerWord;
    const wPerWord = line.words.length > 0 ? lineSpan / line.words.length : 0;
    for (let w = 0; w < line.words.length; w++) {
      line.words[w]!.start = cursorT + w * wPerWord;
      line.words[w]!.end = cursorT + (w + 1) * wPerWord;
    }
    line.start = cursorT;
    line.end = cursorT + lineSpan;
    cursorT += lineSpan;
  }
  redistRuns++;
  i = j + 1;
}

console.log(`Redistributed ${redistRuns} imbalanced line run(s).`);

const newLyrics: Lyrics = { language: row.lyrics.language, lines: newLines };

await db.update(songs).set({ lyrics: newLyrics, updatedAt: new Date() }).where(eq(songs.id, row.id));
console.log(`Updated row ${row.id}. Reload /s/${row.id} in the browser to compare.`);

rmSync(work, { recursive: true, force: true });
process.exit(0);
