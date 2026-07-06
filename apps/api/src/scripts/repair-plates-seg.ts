/* One-off repair: adopt locally-verified plate stickers for a scene whose run
 * fell back (QC flake), persist them + textMode "plates", then the composite
 * can be rebuilt with fix-plates-composite.ts. No AI calls.
 *
 * Usage: tsx src/scripts/repair-plates-seg.ts <jobId> <segIndex> <plate0.png> [<plate1.png> ...]
 */
import "../load-env.js";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { videoJobs } from "../db/schema.js";
import { putObject } from "../lib/r2.js";

const [jobId, segIndexRaw, ...plateFiles] = process.argv.slice(2);
const segIndex = Number(segIndexRaw);

const job = (await db.select().from(videoJobs).where(eq(videoJobs.id, jobId!)))[0];
if (!job) throw new Error("job not found");
const segments = job.segments ?? [];
const seg = segments.find((s) => s.index === segIndex);
if (!seg?.lines) throw new Error("segment/lines not found");
if (plateFiles.length !== seg.lines.length) {
  throw new Error(`need ${seg.lines.length} plate files, got ${plateFiles.length}`);
}

for (const [k, file] of plateFiles.entries()) {
  const plateKey = `video/${job.songId}/${job.id}/plate_${segIndex}_${k}.png`;
  await putObject(plateKey, await readFile(file!), "image/png");
  seg.lines[k]!.plateKey = plateKey;
  console.log(`line ${k} -> ${plateKey}`);
}
seg.textMode = "plates";
seg.loopClipKey = `video/${job.songId}/${job.id}/loop_${segIndex}.mp4`;
seg.plateRect = { x: 0.16, y: 0.15, w: 0.68, h: 0.45 };

await db
  .update(videoJobs)
  .set({ segments, updatedAt: new Date() })
  .where(eq(videoJobs.id, jobId!));
console.log("segment repaired");
process.exit(0);
