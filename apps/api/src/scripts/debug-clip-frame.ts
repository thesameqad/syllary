/* Download a segment's composited clip from R2 and extract frames for visual
 * inspection.
 *
 * Usage: tsx src/scripts/debug-clip-frame.ts <jobId> <segIndex> <outDir>
 */
import "../load-env.js";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { videoJobs } from "../db/schema.js";
import { env } from "../env.js";
import { presignGet } from "../lib/r2.js";

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const ffmpeg = env.FFMPEG_PATH || (require("ffmpeg-static") as string);

const [jobId, segIndexRaw, outDir] = process.argv.slice(2);
const segIndex = Number(segIndexRaw);
const job = (await db.select().from(videoJobs).where(eq(videoJobs.id, jobId!)))[0];
if (!job) throw new Error("job not found");
const seg = (job.segments ?? []).find((s) => s.index === segIndex);
if (!seg) throw new Error("segment not found");
console.log("clipKey:", seg.clipKey, "clipStatus:", seg.clipStatus, "textMode:", seg.textMode);
console.log("lines:", (seg.lines ?? []).map((l) => `${l.text} [${l.start}-${l.end}] plate=${l.plateKey ? "yes" : "no"}`));

await mkdir(outDir!, { recursive: true });
const res = await fetch(await presignGet(seg.clipKey!));
if (!res.ok) throw new Error(`clip download HTTP ${res.status}`);
const clip = path.join(outDir!, "clip.mp4");
await writeFile(clip, Buffer.from(await res.arrayBuffer()));

// Frames at 1s, 3s, 8s — the first line is sung right at the start of the window.
for (const t of [1, 3, 8]) {
  await exec(ffmpeg, ["-y", "-ss", String(t), "-i", clip, "-frames:v", "1", path.join(outDir!, `frame_${t}s.png`)]);
}
console.log("frames written");
process.exit(0);
