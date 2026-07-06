/* Upper band + "wrap and fit" prompt: does explicit sizing guidance stop the
 * truncation? Two candidates, QC'd.
 *
 * Usage: pnpm --filter @syllary/api exec tsx src/scripts/debug-plates-fit.ts <dir>
 */
import "../load-env.js";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env.js";
import { falQueueImage, lyricTextLooksRight } from "../lib/fal-image.js";

const dir = process.argv[2]!;
const LINE = "I close my eyes and feel it all.";

const VARIANTS: Record<string, string> = {
  fit_wrap:
    `Glowing neon lyric text reading "${LINE}" — the complete sentence wrapped onto two ` +
    `centered lines that fit entirely inside this area with clear margins, every word visible ` +
    `and perfectly legible, glow matching the city lights. No quotation marks drawn.`,
  fit_medium:
    `Elegant glowing sign text spelling out the full phrase "${LINE}" in medium-size letters ` +
    `across two centered rows, all words completely visible inside the area, perfectly legible, ` +
    `lit like the scene. No quotation marks drawn.`,
};

const base = await readFile(path.join(dir, "base.png"));
const mask = await readFile(path.join(dir, "mask_upper.png"));
const imageUri = `data:image/png;base64,${base.toString("base64")}`;
const maskUri = `data:image/png;base64,${mask.toString("base64")}`;

const results = await Promise.all(
  Object.entries(VARIANTS).map(async ([name, prompt]) => {
    const out = await falQueueImage(env.FAL_INPAINT_MODEL, {
      prompt,
      image_url: imageUri,
      mask_url: maskUri,
      output_format: "png",
    });
    await writeFile(path.join(dir, `fit_${name}.png`), out);
    const pass = await lyricTextLooksRight(out, LINE);
    return { name, pass };
  }),
);
for (const r of results) console.log(`${r.name}: ${r.pass ? "PASS" : "FAIL"}`);
process.exit(0);
