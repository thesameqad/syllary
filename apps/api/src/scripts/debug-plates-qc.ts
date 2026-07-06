/* Reproduce ONE plate for a failing scene with the CURRENT production recipe
 * (tall band mask + wrap prompt + difference×brightness sticker) and QC every
 * stage — distinguishes "inpaint wrote wrong text" from "extraction ruined it".
 *
 * Usage: tsx src/scripts/debug-plates-qc.ts <jobId> <segIndex> <lineIndex> <outDir>
 */
import "../load-env.js";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { videoJobs } from "../db/schema.js";
import { env } from "../env.js";
import { presignGet } from "../lib/r2.js";
import { falQueueImage, lyricTextLooksRight } from "../lib/fal-image.js";

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const ffmpeg = env.FFMPEG_PATH || (require("ffmpeg-static") as string);

const [jobId, segIndexRaw, lineIndexRaw, outDir] = process.argv.slice(2);
const segIndex = Number(segIndexRaw);
const lineIndex = Number(lineIndexRaw ?? 0);

const job = (await db.select().from(videoJobs).where(eq(videoJobs.id, jobId!)))[0];
if (!job) throw new Error("job not found");
const seg = (job.segments ?? []).find((s) => s.index === segIndex);
if (!seg) throw new Error("segment not found");
const line = seg.lines?.[lineIndex];
if (!line) throw new Error("line not found");
console.log("textMode:", seg.textMode, "line:", line.text);

await mkdir(outDir!, { recursive: true });
async function download(key: string, file: string) {
  const res = await fetch(await presignGet(key));
  if (!res.ok) throw new Error(`download ${key} -> HTTP ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}
const baseKey = `video/${job.songId}/${job.id}/plbase_${segIndex}.png`;
const maskKey = `video/${job.songId}/${job.id}/plmask_${segIndex}.png`;
const baseFile = path.join(outDir!, "base.png");
const maskFile = path.join(outDir!, "mask.png");
await download(baseKey, baseFile);
await download(maskKey, maskFile);

// EXACT production prompt (plates.ts platePrompt).
const prompt =
  `Glowing elegant lyric text reading "${line.text}" — the whole sentence wrapped onto two ` +
  `centered lines, every word visible and perfectly legible, luminous glow matching the ` +
  `scene's light and palette. No quotation marks drawn.`;

const inpainted = await falQueueImage(env.FAL_INPAINT_MODEL, {
  prompt,
  image_url: await presignGet(baseKey),
  mask_url: await presignGet(maskKey),
  output_format: "png",
});
const inFile = path.join(outDir!, "inpainted.png");
await writeFile(inFile, inpainted);

// EXACT production sticker extraction (plates.ts makeSticker, 16:9 canvas).
const w = 1280;
const h = 720;
const stickerFile = path.join(outDir!, "sticker.png");
await exec(ffmpeg, [
  "-y", "-i", inFile, "-i", baseFile,
  "-filter_complex",
  `[0:v]scale=${w}:${h},format=rgb24,split=3[i1][i2][i3];` +
    `[1:v]scale=${w}:${h},format=rgb24[b];` +
    `[i1][b]blend=all_mode=difference,format=gray[d];` +
    `[i3]format=gray[l];` +
    `[d][l]blend=all_mode=multiply,lutyuv=y='if(gt(val,36),255,0)',` +
    `boxblur=luma_radius=3:luma_power=1,lutyuv=y='if(gt(val,64),255,val*2)'[a];` +
    `[i2][a]alphamerge[out]`,
  "-map", "[out]", "-frames:v", "1", stickerFile,
]);
// Sticker flattened on gray for human inspection.
await exec(ffmpeg, [
  "-y", "-f", "lavfi", "-i", `color=c=0x303030:s=${w}x${h}`, "-i", stickerFile,
  "-filter_complex", "[0:v][1:v]overlay=0:0",
  "-frames:v", "1", path.join(outDir!, "sticker_on_gray.png"),
]);

const qcFull = await lyricTextLooksRight(inpainted, line.text);
const qcSticker = await lyricTextLooksRight(await readFile(stickerFile), line.text);
console.log(`QC full inpainted: ${qcFull ? "PASS" : "FAIL"}`);
console.log(`QC sticker:        ${qcSticker ? "PASS" : "FAIL"}`);
process.exit(0);
