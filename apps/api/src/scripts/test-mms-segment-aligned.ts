/**
 * Validation: per-line MMS alignment using WhisperX SEGMENT boundaries
 * as audio chunk anchors. This is the architecture that should actually
 * work — chunks come from WhisperX (~500ms-accurate, monotonic, never
 * polluted by post-processing), not from previously-stored DB approximations.
 *
 * Pipeline:
 *   1. Read whisperx-segments.json (produced by fetch-whisperx-segments.ts).
 *   2. Read canonical Lyrics from DB.
 *   3. Greedy-map each canonical line to its source segment(s) by text
 *      similarity (LLM reformatted lines, so we compare normalized words).
 *   4. For each line, audio chunk = matched segments' [start, end] with
 *      tight ±0.2s padding.
 *   5. Run MMS in docker container, one alignment per chunk.
 *   6. Map MMS words back into each line's tokens (preserve casing/punct).
 *   7. Stage to JSON; apply-staged-lyrics.ts then writes to DB.
 *
 *   Usage:
 *     node --import ./apps/api/node_modules/tsx/dist/loader.mjs --env-file=.env \
 *       apps/api/src/scripts/test-mms-segment-aligned.ts 3.mp3
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
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

if (!row?.lyrics) throw new Error(`No lyrics for ${filename}`);
const lines: LyricLine[] = row.lyrics.lines;

type Segment = { start: number; end: number; text: string };
const segPath = join(REPO_ROOT, "cog", "mms-aligner", "whisperx-segments.json");
const segData = JSON.parse(readFileSync(segPath, "utf-8")) as { songId: string; segments: Segment[] };
const segments = segData.segments;

console.error(`Lines: ${lines.length}  Segments: ${segments.length}`);

// ----- Step 1: map canonical lines to source segments -----

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s: string) => norm(s).split(" ").filter(Boolean);

type ChunkRef = { lineIdx: number; chunkStart: number; chunkEnd: number; matchedSegs: number };

const chunks: ChunkRef[] = [];
let segCursor = 0;
const MAX_LOOKAHEAD = 8;
const MAX_SPAN = 4;

for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
  const lineTokens = tokens(lines[lineIdx]!.text);
  const lineSet = new Set(lineTokens);
  if (lineTokens.length === 0) {
    chunks.push({ lineIdx, chunkStart: lines[lineIdx]!.start, chunkEnd: lines[lineIdx]!.end, matchedSegs: 0 });
    continue;
  }

  // Search forward from segCursor for the segment range whose joined tokens
  // give the highest overlap with this line's tokens.
  let bestStart = segCursor;
  let bestEnd = segCursor;
  let bestOverlap = -1;

  for (let s = segCursor; s < Math.min(segments.length, segCursor + MAX_LOOKAHEAD); s++) {
    for (let e = s; e < Math.min(segments.length, s + MAX_SPAN); e++) {
      const joined = segments.slice(s, e + 1).map((seg) => seg.text).join(" ");
      const joinedTokens = tokens(joined);
      let overlap = 0;
      for (const t of joinedTokens) if (lineSet.has(t)) overlap++;
      // Prefer minimal extra segments — score = overlap minus extra-length penalty.
      const penalty = Math.max(0, joinedTokens.length - lineTokens.length) * 0.1;
      const score = overlap - penalty;
      if (score > bestOverlap) {
        bestOverlap = score;
        bestStart = s;
        bestEnd = e;
      }
    }
  }

  if (bestOverlap <= 0) {
    // No reasonable match; fall back to DB line bounds.
    chunks.push({ lineIdx, chunkStart: lines[lineIdx]!.start, chunkEnd: lines[lineIdx]!.end, matchedSegs: 0 });
    continue;
  }

  chunks.push({
    lineIdx,
    chunkStart: segments[bestStart]!.start,
    chunkEnd: segments[bestEnd]!.end,
    matchedSegs: bestEnd - bestStart + 1,
  });
  segCursor = bestEnd + 1;
}

const matchedCount = chunks.filter((c) => c.matchedSegs > 0).length;
console.error(`Mapped ${matchedCount}/${lines.length} lines to segments (rest fell back to DB bounds).`);
console.error(`Sample chorus mapping:`);
for (let i = 13; i <= 17 && i < lines.length; i++) {
  const c = chunks.find((x) => x.lineIdx === i)!;
  console.error(`  L${i} [${c.chunkStart.toFixed(2)}-${c.chunkEnd.toFixed(2)}] ${c.matchedSegs} segs ← "${lines[i]!.text.slice(0, 50)}"`);
}

// ----- Step 2: invoke docker → per-line MMS alignment -----

const inputPath = join(REPO_ROOT, "cog", "mms-aligner", "mms-input.json");
writeFileSync(
  inputPath,
  JSON.stringify(
    {
      audio_path: `/work/uploads/${filename}`,
      // Tight padding — segments are trustworthy boundaries so we don't need
      // a 2-second buffer.
      padding_sec: 0.2,
      lines: chunks.map((c) => ({
        index: c.lineIdx,
        text: lines[c.lineIdx]!.text,
        start: c.chunkStart,
        end: c.chunkEnd,
      })),
    },
    null,
    2,
  ),
);
console.error(`Wrote ${inputPath}`);

const toWsl = (p: string) =>
  p.replace(/^([A-Z]):/, (_, d: string) => `/mnt/${d.toLowerCase()}`).replace(/\\/g, "/");
const wslRepo = toWsl(REPO_ROOT);
const dockerLogPath = join(REPO_ROOT, "cog", "mms-aligner", "docker-run.log");
const wslLogPath = toWsl(dockerLogPath);
const bashCmd = `docker run --rm -v '${wslRepo}:/work' -v mms-model-cache:/root/.cache/torch cog-mms-aligner:latest python /work/cog/mms-aligner/realign-per-line.py > '${wslLogPath}' 2>&1; echo "docker exited \$?"`;

console.error(`Running per-line MMS via docker (CPU)…`);
execFileSync("wsl.exe", ["--", "bash", "-lc", bashCmd], { stdio: ["ignore", "inherit", "inherit"] });

// Surface the tail of the docker log so successes/failures are visible.
try {
  const log = readFileSync(dockerLogPath, "utf-8");
  console.error("--- docker log tail ---");
  console.error(log.split("\n").slice(-15).join("\n"));
  console.error("--- end docker log ---");
} catch {}

// ----- Step 3: stitch per-line MMS words back into line tokens -----

type MmsLineOut = {
  index: number;
  words: { text: string; start: number; end: number; score: number }[];
  skipped?: string;
};
const outputPath = join(REPO_ROOT, "cog", "mms-aligner", "mms-output.json");
const output = JSON.parse(readFileSync(outputPath, "utf-8")) as { lines: MmsLineOut[] };

const normToken = (s: string) => s.toLowerCase().replace(/[^a-z0-9']/g, "");
let totalUnmatched = 0;
let totalSkipped = 0;

const newLines: LyricLine[] = lines.map((line, lineIdx) => {
  const out = output.lines.find((o) => o.index === lineIdx);
  if (!out || out.skipped || out.words.length === 0) {
    totalSkipped++;
    return line;
  }
  const lineTokenTexts = line.text.split(/\s+/).filter(Boolean);
  const lineWords: { text: string; start: number | null; end: number | null }[] = lineTokenTexts.map(
    (t) => ({ text: t, start: null, end: null }),
  );
  let cursor = 0;
  for (let k = 0; k < lineTokenTexts.length; k++) {
    const tok = normToken(lineTokenTexts[k]!);
    if (!tok) continue;
    const limit = Math.min(out.words.length, cursor + 6);
    for (let j = cursor; j < limit; j++) {
      const w = out.words[j]!;
      if (normToken(w.text) !== tok) continue;
      lineWords[k]!.start = w.start;
      lineWords[k]!.end = w.end;
      cursor = j + 1;
      break;
    }
    if (lineWords[k]!.start === null) totalUnmatched++;
  }
  // Interpolate any unmatched tokens.
  const firstMatched = lineWords.find((w) => w.start !== null);
  const lastMatched = [...lineWords].reverse().find((w) => w.end !== null);
  const lineStart = firstMatched?.start ?? line.start;
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
  return {
    text: line.text,
    start: finalWords[0]?.start ?? lineStart,
    end: finalWords.at(-1)?.end ?? lineEnd,
    words: finalWords,
    section: line.section,
  };
});

console.error(`Re-aligned ${newLines.length} lines.  unmatched tokens: ${totalUnmatched}  skipped: ${totalSkipped}`);

// Tight end-trim only — no forward-shift cascade.
let trimmed = 0;
for (let i = 0; i < newLines.length - 1; i++) {
  const cur = newLines[i]!;
  const nxt = newLines[i + 1]!;
  const maxEnd = nxt.start - 0.05;
  if (cur.end > maxEnd && maxEnd > cur.start) {
    cur.end = maxEnd;
    for (const w of cur.words) {
      if (w.end > maxEnd) w.end = maxEnd;
      if (w.start > maxEnd) w.start = maxEnd;
    }
    trimmed++;
  }
}
console.error(`End-trim deconflict: ${trimmed} line(s) trimmed`);

const newLyrics: Lyrics = { language: row.lyrics.language, lines: newLines };
const stagedPath = join(REPO_ROOT, "cog", "mms-aligner", "staged-lyrics.json");
writeFileSync(stagedPath, JSON.stringify({ songId: row.id, lyrics: newLyrics }, null, 2));
console.error(`Staged → ${stagedPath}`);
console.error(`Apply with: node --import ./apps/api/node_modules/tsx/dist/loader.mjs --env-file=.env apps/api/src/scripts/apply-staged-lyrics.ts`);
process.exit(0);
