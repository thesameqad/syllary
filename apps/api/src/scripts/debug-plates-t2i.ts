/* Prototype: plates via Qwen TEXT-TO-IMAGE typography cards (straight, centered,
 * full-width) on near-black, luma-extracted into stickers — instead of scene
 * inpainting. Generates one card, extracts the sticker, QCs it, previews on gray
 * and composited over the actual loop frame.
 *
 * Usage: tsx src/scripts/debug-plates-t2i.ts <outDir>
 */
import "../load-env.js";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { env } from "../env.js";
import { falQueueImage, lyricTextLooksRight } from "../lib/fal-image.js";

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const ffmpeg = env.FFMPEG_PATH || (require("ffmpeg-static") as string);

const outDir = process.argv[2]!;
await mkdir(outDir, { recursive: true });

const LINE = "And everything is quiet now,";
const STYLE =
  "Cyberpunk megacity at night: rain-slick streets, glowing neon signage, magenta and cyan light";

// Typography-card dialect: pure text on near-black, straight and centered — the
// scene style informs only the lettering treatment.
const prompt =
  `Typography design on a solid pure black background: the words "${LINE}" in elegant ` +
  `luminous lettering whose material, color and mood match this art direction: ${STYLE}. ` +
  `Written straight and horizontally centered, large, filling the width with margins, ` +
  `wrapped onto two lines if needed. Solid black everywhere else — no scenery, no signs, ` +
  `no shapes, no frame, no reflections, only the glowing words. No quotation marks drawn.`;

const card = await falQueueImage("fal-ai/qwen-image", {
  prompt,
  image_size: { width: 1280, height: 720 },
  num_images: 1,
});
const cardFile = path.join(outDir, "card.png");
await writeFile(cardFile, card);

// Luma-key extraction: alpha from brightness (black bg → transparent).
const stickerFile = path.join(outDir, "sticker.png");
await exec(ffmpeg, [
  "-y", "-i", cardFile,
  "-filter_complex",
  `[0:v]scale=1280:720,format=rgb24,split=2[c][l];` +
    `[l]format=gray,lutyuv=y='if(gt(val,30),255,val*4)',boxblur=luma_radius=1:luma_power=1[a];` +
    `[c][a]alphamerge[out]`,
  "-map", "[out]", "-frames:v", "1", stickerFile,
]);
await exec(ffmpeg, [
  "-y", "-f", "lavfi", "-i", "color=c=0x303030:s=1280x720", "-i", stickerFile,
  "-filter_complex", "[0:v][1:v]overlay=0:0", "-frames:v", "1",
  path.join(outDir, "sticker_on_gray.png"),
]);

const qcCard = await lyricTextLooksRight(card, LINE);
const qcSticker = await lyricTextLooksRight(await readFile(stickerFile), LINE);
console.log(`QC card:    ${qcCard ? "PASS" : "FAIL"}`);
console.log(`QC sticker: ${qcSticker ? "PASS" : "FAIL"}`);
process.exit(0);
