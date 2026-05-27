/**
 * Per-line MMS forced alignment validation script.
 *
 * Solves the "wrong Static matched to wrong line" failure that whole-song
 * alignment produces on repetitive choruses. We split the audio per line
 * (using the existing approximate line boundaries from the previous run)
 * and run MMS_FA forced alignment on each chunk independently — so each
 * call only sees one "Static skin" in audio and one in transcript.
 *
 * Architecture:
 *   1. Read canonical Lyrics from DB (whatever line boundaries we have —
 *      they only need to be ballpark accurate, since the per-line MMS
 *      pass has padding on both sides).
 *   2. Write mms-input.json to cog/mms-aligner/.
 *   3. `docker run` the cog image with a persistent model-cache volume,
 *      executing realign-per-line.py inside.
 *   4. Read mms-output.json, map per-line MMS words back onto each line's
 *      original tokens (preserving line.text casing/punctuation), interpolate
 *      any tokens MMS dropped, write the new Lyrics back to DB.
 *
 *   Usage:
 *     node --import ./apps/api/node_modules/tsx/dist/loader.mjs --env-file=.env \
 *       apps/api/src/scripts/test-mms-per-line.ts 3.mp3
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
console.error(`Song ${row.id}  file=${filename}  mode=${row.mode}  lines=${lines.length}`);

const inputPath = join(REPO_ROOT, "cog", "mms-aligner", "mms-input.json");
const outputPath = join(REPO_ROOT, "cog", "mms-aligner", "mms-output.json");

// The container script reads the audio from /work/uploads/... — /work is
// the repo root mounted in.
writeFileSync(
  inputPath,
  JSON.stringify(
    {
      audio_path: `/work/uploads/${filename}`,
      // Tight padding so MMS doesn't pick up audio from adjacent lines as
      // a phonetic match. Coarse line boundaries from the DB should be
      // within ~0.5s of truth from prior passes.
      padding_sec: 0.5,
      lines: lines.map((l, i) => ({ index: i, text: l.text, start: l.start, end: l.end })),
    },
    null,
    2,
  ),
);
console.error(`Wrote ${inputPath}`);

const toWsl = (p: string) =>
  p.replace(/^([A-Z]):/, (_, d: string) => `/mnt/${d.toLowerCase()}`).replace(/\\/g, "/");
const wslRepo = toWsl(REPO_ROOT);

console.error("Running docker (cog-mms-aligner) with per-line script…");
// Route through `bash -lc` and tee docker's output to a file so we can
// post-mortem if things hang. Direct `wsl.exe -- docker` was found to drop
// docker stdout silently after model load on this host.
const dockerLogPath = join(REPO_ROOT, "cog", "mms-aligner", "docker-run.log");
const wslLogPath = toWsl(dockerLogPath);
const bashCmd = `docker run --rm -v '${wslRepo}:/work' -v mms-model-cache:/root/.cache/torch cog-mms-aligner:latest python /work/cog/mms-aligner/realign-per-line.py > '${wslLogPath}' 2>&1; echo "docker exited \$?"`;
console.error(`> wsl.exe -- bash -lc "${bashCmd}"`);

try {
  execFileSync("wsl.exe", ["--", "bash", "-lc", bashCmd], {
    stdio: ["ignore", "inherit", "inherit"],
  });
} catch (e) {
  throw new Error(`docker failed: ${(e as Error).message}`);
}
console.error("[done] docker container exited");

// Dump the last few lines of docker log so a failure is visible.
try {
  const log = readFileSync(dockerLogPath, "utf-8");
  console.error("--- docker log tail ---");
  console.error(log.split("\n").slice(-20).join("\n"));
  console.error("--- end docker log ---");
} catch {
  console.error("(no docker log written)");
}

type MmsLineOut = {
  index: number;
  words: { text: string; start: number; end: number; score: number }[];
  skipped?: string;
};
const output = JSON.parse(readFileSync(outputPath, "utf-8")) as { lines: MmsLineOut[] };

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9']/g, "");

let totalUnmatched = 0;
let totalSkipped = 0;
const newLines: LyricLine[] = lines.map((line, lineIdx) => {
  const out = output.lines.find((o) => o.index === lineIdx);
  if (!out || out.skipped || out.words.length === 0) {
    totalSkipped++;
    return line; // keep the previous per-word timings as-is
  }

  // Greedy text-match: walk MMS words sequentially against the line's
  // original tokens. MMS's normalized output may drop chars or hyphenate
  // ("six-by-eight" → "sixbyeight") so we compare on alpha+apostrophe.
  const tokens = line.text.split(/\s+/).filter(Boolean);
  const lineWords: { text: string; start: number | null; end: number | null }[] = tokens.map(
    (t) => ({ text: t, start: null, end: null }),
  );
  let cursor = 0;
  for (let k = 0; k < tokens.length; k++) {
    const tok = normalize(tokens[k]!);
    if (!tok) continue;
    const limit = Math.min(out.words.length, cursor + 8);
    for (let j = cursor; j < limit; j++) {
      const w = out.words[j]!;
      if (normalize(w.text) !== tok) continue;
      lineWords[k]!.start = w.start;
      lineWords[k]!.end = w.end;
      cursor = j + 1;
      break;
    }
    if (lineWords[k]!.start === null) totalUnmatched++;
  }

  // Interpolate any tokens we couldn't match.
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

console.error(
  `Re-aligned ${newLines.length} lines.  unmatched tokens: ${totalUnmatched}  ` +
    `skipped lines (kept old timing): ${totalSkipped}.`,
);

// Deconflict line spans. Per-line MMS chunks have padding, so adjacent
// chunks overlap in audio and each independently places its first word into
// that overlap region. Worse: in some choruses MMS picks a different best-
// match audio region for line[i+1] vs line[i], producing non-monotonic line
// starts (line 17 starting before line 16). Two-pass fix:
//   1. Forward shift: if line[i].start < line[i-1].end + GAP, shift the
//      whole line (start/end and all its words) forward so the line slots
//      in after its predecessor.
//   2. End-trim: if line[i].end > line[i+1].start, trim line[i].end and any
//      words extending past it.
// The shifts/trims preserve internal word ORDER but may compress some lines
// to near-zero width — that's the honest representation of MMS uncertainty
// in that region.
const BOUNDARY_GAP_SEC = 0.05;

// End-trim only — forward-shifting was cascading 42/43 lines.
let trimmedCount = 0;
for (let i = 0; i < newLines.length - 1; i++) {
  const cur = newLines[i]!;
  const nxt = newLines[i + 1]!;
  const maxEnd = nxt.start - BOUNDARY_GAP_SEC;
  if (cur.end > maxEnd && maxEnd > cur.start) {
    cur.end = maxEnd;
    for (const w of cur.words) {
      if (w.end > maxEnd) w.end = maxEnd;
      if (w.start > maxEnd) w.start = maxEnd;
    }
    trimmedCount++;
  }
}
console.error(`End trim: ${trimmedCount} line(s) trimmed`);

const newLyrics: Lyrics = { language: row.lyrics.language, lines: newLines };

// db.update hangs silently if called after a multi-minute synchronous
// child_process — the underlying `postgres` connection state gets wedged.
// Dump to a JSON file instead and let the user (or a separate fresh
// process) apply it.
const stagedPath = join(REPO_ROOT, "cog", "mms-aligner", "staged-lyrics.json");
writeFileSync(stagedPath, JSON.stringify({ songId: row.id, lyrics: newLyrics }, null, 2));
console.error(`Staged updated lyrics → ${stagedPath}`);
console.error(`Apply with: node --import ./apps/api/node_modules/tsx/dist/loader.mjs --env-file=.env apps/api/src/scripts/apply-staged-lyrics.ts`);
