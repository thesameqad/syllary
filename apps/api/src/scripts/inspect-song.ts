import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { songs } from "../db/schema.js";

const id = process.argv[2];
if (!id) {
  console.error("usage: tsx src/scripts/inspect-song.ts <songId>");
  process.exit(1);
}

const [row] = await db.select().from(songs).where(eq(songs.id, id)).limit(1);
if (!row) {
  console.log("not found");
  process.exit(0);
}

console.log("status:", row.status, "updated_at:", row.updatedAt.toISOString());
const lines = row.lyrics?.lines ?? [];
console.log("line count:", lines.length);
for (let i = 0; i < lines.length; i++) {
  const l = lines[i]!;
  console.log(`--- line ${i} (text=${JSON.stringify(l.text)}) ---`);
  console.log(`  start/end: ${l.start.toFixed(3)} - ${l.end.toFixed(3)}`);
  console.log(
    "  words:",
    l.words
      .map((w) => `"${w.text}"@${w.start.toFixed(2)}-${w.end.toFixed(2)}`)
      .join(" | "),
  );
}

process.exit(0);
