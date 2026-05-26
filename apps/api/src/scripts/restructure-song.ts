/**
 * Re-runs the LLM structuring step against a song's existing raw lyrics and
 * writes the structured result back. Useful for recovering a row where the
 * original structureLyrics call returned null (transient API error / restart).
 *
 *   tsx src/scripts/restructure-song.ts <songId>
 */
import "../load-env.js";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { songs } from "../db/schema.js";
import { structureLyrics } from "../lib/openrouter.js";
import { alignLines } from "../lib/transcript.js";

const songId = process.argv[2];
if (!songId) {
  console.error("usage: tsx src/scripts/restructure-song.ts <songId>");
  process.exit(1);
}

const [row] = await db.select().from(songs).where(eq(songs.id, songId)).limit(1);
if (!row) {
  console.error("song not found");
  process.exit(1);
}
if (!row.lyrics) {
  console.error("song has no lyrics yet");
  process.exit(1);
}

const lines = row.lyrics.lines;
const words = lines.flatMap((l) => l.words);
console.log(`song: ${row.originalFilename} | mode: ${row.mode} | ${lines.length} lines, ${words.length} words`);

const structured = await structureLyrics(lines.map((l) => l.text));
if (!structured) {
  console.error("structureLyrics returned null");
  process.exit(1);
}
console.log(`→ structured: ${structured.lines.length} lines, ${structured.sections.length} sections`);
console.log("sections:", structured.sections);

const sectionByIndex = new Map(structured.sections.map((s) => [s.index, s.label]));
const aligned = alignLines(structured.lines, words).map((line, i) => ({
  ...line,
  section: sectionByIndex.get(i) ?? null,
}));

const nextLyrics = { language: row.lyrics.language, lines: aligned };
await db
  .update(songs)
  .set({ lyrics: nextLyrics, updatedAt: new Date() })
  .where(and(eq(songs.id, songId), eq(songs.status, "ready")));

console.log("done. updated row.");
process.exit(0);
