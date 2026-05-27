/** Quick DB dump: show lines + word timings for a song around a given range. */
import "dotenv/config";
import { desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { songs } from "../db/schema.js";

const filename = process.argv[2] ?? "3.mp3";
const fromIdx = Number(process.argv[3] ?? 12);
const toIdx = Number(process.argv[4] ?? 20);

const [row] = await db
  .select()
  .from(songs)
  .where(or(eq(songs.originalFilename, filename), ilike(songs.originalFilename, `%${filename}%`)))
  .orderBy(desc(songs.createdAt))
  .limit(1);

if (!row?.lyrics) throw new Error("no lyrics");
for (let i = fromIdx; i <= toIdx && i < row.lyrics.lines.length; i++) {
  const l = row.lyrics.lines[i]!;
  console.log(`[${i}] ${l.start.toFixed(2)}–${l.end.toFixed(2)}  ${JSON.stringify(l.text)}`);
  for (let k = 0; k < l.words.length; k++) {
    const w = l.words[k]!;
    console.log(`     ${k.toString().padStart(2)}  ${w.start.toFixed(3)}–${w.end.toFixed(3)}  ${JSON.stringify(w.text)}`);
  }
}
process.exit(0);
