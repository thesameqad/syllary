/* Re-composite a plates scene from its ALREADY-GENERATED loop + plate stickers
 * (no AI calls, no charge) using the fixed overlayPlatesOnClip, upload over the
 * segment's clipKey, and dump a verification frame.
 *
 * Usage: tsx src/scripts/fix-plates-composite.ts <jobId> <segIndex> <outDir>
 */
import "../load-env.js";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import type { AspectRatio } from "@syllary/shared";
import { db } from "../db/client.js";
import { videoJobs } from "../db/schema.js";
import { env } from "../env.js";
import { presignGet, putObject } from "../lib/r2.js";
import { overlayPlatesOnClip } from "../lib/plates.js";

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const ffmpeg = env.FFMPEG_PATH || (require("ffmpeg-static") as string);

const [jobId, segIndexRaw, outDir] = process.argv.slice(2);
const segIndex = Number(segIndexRaw);
const job = (await db.select().from(videoJobs).where(eq(videoJobs.id, jobId!)))[0];
if (!job) throw new Error("job not found");
const seg = (job.segments ?? []).find((s) => s.index === segIndex);
if (!seg) throw new Error("segment not found");
if (seg.textMode !== "plates" || !seg.loopClipKey) throw new Error("not a plates scene with a loop");
const lines = (seg.lines ?? []).filter((l) => l.plateKey);
if (lines.length === 0) throw new Error("no plates persisted");

await mkdir(outDir!, { recursive: true });
async function download(key: string, file: string) {
  const res = await fetch(await presignGet(key));
  if (!res.ok) throw new Error(`download ${key} -> HTTP ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

const loopFile = path.join(outDir!, `loop_${segIndex}.mp4`);
await download(seg.loopClipKey, loopFile);
const plates: { file: string; start: number; end: number }[] = [];
for (const [k, line] of lines.entries()) {
  const f = path.join(outDir!, `plate_${segIndex}_${k}.png`);
  await download(line.plateKey!, f);
  plates.push({
    file: f,
    start: Math.max(0, line.start - seg.clipStart),
    end: Math.max(0.4, line.end - seg.clipStart),
  });
}
console.log("plates:", plates.map((p) => `${p.start.toFixed(2)}-${p.end.toFixed(2)}`).join(", "));

const CANVAS: Record<AspectRatio, { w: number; h: number }> = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
};
const { w, h } = CANVAS[job.aspectRatio as AspectRatio];
const outName = `clip_${segIndex}.mp4`;
await overlayPlatesOnClip({
  workDir: outDir!,
  loopFile,
  plates,
  aspectRatio: job.aspectRatio as AspectRatio,
  canvasW: w,
  canvasH: h,
  outName,
});
const outFile = path.join(outDir!, outName);
await putObject(seg.clipKey!, await readFile(outFile), "video/mp4");
console.log("re-composited + uploaded to", seg.clipKey);

// Verification frame in the middle of the first line's window.
const t = plates[0]!.start + (plates[0]!.end - plates[0]!.start) / 2;
await exec(ffmpeg, ["-y", "-ss", t.toFixed(2), "-i", outFile, "-frames:v", "1", path.join(outDir!, "verify.png")]);
console.log(`verify frame at ${t.toFixed(2)}s written`);
process.exit(0);
