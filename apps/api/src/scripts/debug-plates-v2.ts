/* Two remaining candidates for reliable lyric plates:
 *   A. inpaint with the TALLER probe-proven band (h=0.45)
 *   B. fal-ai/qwen-image-edit (instruction edit, whole image) — crop the band after
 *
 * Usage: pnpm --filter @syllary/api exec tsx src/scripts/debug-plates-v2.ts <dir>
 */
import "../load-env.js";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { env } from "../env.js";
import { falQueueImage, lyricTextLooksRight } from "../lib/fal-image.js";

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const ffmpeg = env.FFMPEG_PATH || (require("ffmpeg-static") as string);

const dir = process.argv[2]!;
const LINE = "I close my eyes and feel it all.";
const RECT = { x: 0.16, y: 0.15, w: 0.68, h: 0.45 }; // probe attempt-2 band

const x = Math.round(1280 * RECT.x);
const y = Math.round(720 * RECT.y);
const w = Math.round(1280 * RECT.w);
const h = Math.round(720 * RECT.h);
const maskFile = path.join(dir, "mask_tall.png");
await exec(ffmpeg, [
  "-y", "-f", "lavfi", "-i", "color=c=black:s=1280x720",
  "-vf", `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=white:t=fill,boxblur=luma_radius=20:luma_power=2`,
  "-frames:v", "1", maskFile,
]);

const base = await readFile(path.join(dir, "base.png"));
const imageUri = `data:image/png;base64,${base.toString("base64")}`;
const maskUri = `data:image/png;base64,${(await readFile(maskFile)).toString("base64")}`;

const tallInpaint = (async () => {
  const out = await falQueueImage(env.FAL_INPAINT_MODEL, {
    prompt:
      `Glowing neon lyric text reading "${LINE}" — the whole sentence wrapped onto two ` +
      `centered lines, every word visible and perfectly legible, glow matching the city ` +
      `lights. No quotation marks drawn.`,
    image_url: imageUri,
    mask_url: maskUri,
    output_format: "png",
  });
  await writeFile(path.join(dir, "v2_tall_inpaint.png"), out);
  return lyricTextLooksRight(out, LINE);
})();

const editAdd = (async () => {
  const out = await falQueueImage("fal-ai/qwen-image-edit", {
    prompt:
      `Add large glowing neon sign text across the upper half of the image that reads ` +
      `"${LINE}" — the complete sentence, every word perfectly legible, wrapped onto two ` +
      `lines if needed, glow matching the scene. Keep everything else exactly the same. ` +
      `No quotation marks drawn.`,
    image_url: imageUri,
    output_format: "png",
  });
  await writeFile(path.join(dir, "v2_edit_add.png"), out);
  return lyricTextLooksRight(out, LINE);
})();

const [a, b] = await Promise.all([tallInpaint, editAdd]);
console.log(`tall inpaint (h=0.45): ${a ? "PASS" : "FAIL"}`);
console.log(`qwen-image-edit add:  ${b ? "PASS" : "FAIL"}`);
process.exit(0);
