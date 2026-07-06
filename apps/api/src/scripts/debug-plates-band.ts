/* Same base, mid-upper "wall" band instead of the lower-third the variance
 * heuristic picked — production prompt vs object-anchored prompt, QC'd.
 *
 * Usage: pnpm --filter @syllary/api exec tsx src/scripts/debug-plates-band.ts <dir>
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
const RECT = { x: 0.16, y: 0.16, w: 0.68, h: 0.34 }; // BAND_CANDIDATES[0], probe-proven position

const x = Math.round(1280 * RECT.x);
const y = Math.round(720 * RECT.y);
const w = Math.round(1280 * RECT.w);
const h = Math.round(720 * RECT.h);
const maskFile = path.join(dir, "mask_upper.png");
await exec(ffmpeg, [
  "-y", "-f", "lavfi", "-i", "color=c=black:s=1280x720",
  "-vf", `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=white:t=fill,boxblur=luma_radius=20:luma_power=2`,
  "-frames:v", "1", maskFile,
]);

const style =
  "Cyberpunk megacity at night: rain-slick streets, towering skyscrapers drenched in glowing " +
  "neon signage and holograms, magenta and cyan light, volumetric haze, reflections, Blade Runner " +
  "mood, moody cinematic, ultra detailed";
const VARIANTS: Record<string, string> = {
  production:
    `Glowing elegant text integrated into the scene reads "${LINE}" — large, perfectly ` +
    `legible, matching the scene's lighting and palette, styled to fit: ${style}. ` +
    `No quotation marks drawn.`,
  neon_object:
    `A giant glowing neon sign floats across this area, spelling "${LINE}" in large ` +
    `bold letters — every word perfectly legible, magenta and cyan glow matching the city lights.`,
};

const base = await readFile(path.join(dir, "base.png"));
const imageUri = `data:image/png;base64,${base.toString("base64")}`;
const maskUri = `data:image/png;base64,${(await readFile(maskFile)).toString("base64")}`;

const results = await Promise.all(
  Object.entries(VARIANTS).map(async ([name, prompt]) => {
    const out = await falQueueImage(env.FAL_INPAINT_MODEL, {
      prompt,
      image_url: imageUri,
      mask_url: maskUri,
      output_format: "png",
    });
    await writeFile(path.join(dir, `upper_${name}.png`), out);
    const pass = await lyricTextLooksRight(out, LINE);
    return { name, pass };
  }),
);
for (const r of results) console.log(`upper band / ${r.name}: ${r.pass ? "PASS" : "FAIL"}`);
process.exit(0);
