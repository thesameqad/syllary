/* Try several inpaint prompt dialects against the SAME failing base+mask and
 * QC each result. Reuses the artifacts downloaded by debug-plates-qc.ts.
 *
 * Usage: pnpm --filter @syllary/api exec tsx src/scripts/debug-plates-prompts.ts <dir>
 */
import "../load-env.js";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env.js";
import { falQueueImage, lyricTextLooksRight } from "../lib/fal-image.js";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: debug-plates-prompts.ts <dir with base.png + mask.png>");
  process.exit(1);
}

const LINE = "I close my eyes and feel it all.";
const VARIANTS: Record<string, string> = {
  // A: text as a concrete glowing object filling the band, style reduced to a hint
  neon_object:
    `A giant glowing neon sign floats across this area, spelling "${LINE}" in large ` +
    `bold letters — every word perfectly legible, magenta and cyan glow matching the city lights.`,
  // B: pure typography plate, no scene language at all
  title_card:
    `Large elegant movie-title typography reading "${LINE}" — the words fill the area ` +
    `in big luminous letters, perfectly legible, nothing else added.`,
  // C: probe-style surface anchor, generic surface word
  surface_anchor:
    `Glowing elegant text written across the surface here reads "${LINE}" — large, ` +
    `perfectly legible, lit like the scene, no quotation marks drawn.`,
};

const base = await readFile(path.join(dir, "base.png"));
const mask = await readFile(path.join(dir, "mask.png"));
const imageUri = `data:image/png;base64,${base.toString("base64")}`;
const maskUri = `data:image/png;base64,${mask.toString("base64")}`;

const results = await Promise.all(
  Object.entries(VARIANTS).map(async ([name, prompt]) => {
    const t = Date.now();
    const out = await falQueueImage(env.FAL_INPAINT_MODEL, {
      prompt,
      image_url: imageUri,
      mask_url: maskUri,
      output_format: "png",
    });
    await writeFile(path.join(dir, `variant_${name}.png`), out);
    const pass = await lyricTextLooksRight(out, LINE);
    return { name, secs: ((Date.now() - t) / 1000).toFixed(1), pass };
  }),
);
for (const r of results) console.log(`${r.name}: ${r.pass ? "PASS" : "FAIL"} (${r.secs}s)`);
process.exit(0);
