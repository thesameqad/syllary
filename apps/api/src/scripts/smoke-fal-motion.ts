import "../load-env.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateMotionClip, type MotionRoute } from "../lib/fal-video.js";
import { presignGet } from "../lib/r2.js";

/** One-off post-migration smoke test: one real clip through EACH fal route via
 *  the production facade (validates the route input schemas end-to-end, esp.
 *  kling's start_image_url/end_image_url which was docs-derived).
 *    pnpm --filter @syllary/api exec tsx src/scripts/smoke-fal-motion.ts
 */

const FIRST =
  "video/80047f21-6dac-4635-881e-09b1c258b13e/0845e9b7-2307-4c6d-88df-c1fe72584b1e/img_0.jpg";
const LAST =
  "video/80047f21-6dac-4635-881e-09b1c258b13e/0845e9b7-2307-4c6d-88df-c1fe72584b1e/img_1.jpg";
const OUT =
  "C:\\Users\\thesa\\AppData\\Local\\Temp\\claude\\C--Users-thesa-Documents-src-ErmanAI-syllary\\25d89ce9-a539-49da-b27d-dcb60a33e53f\\scratchpad";
const PROMPT = "Gentle cinematic motion, soft morning light drifts across the room.";

async function main(): Promise<void> {
  const firstFrameUrl = await presignGet(FIRST);
  const lastFrameUrl = await presignGet(LAST);
  const routes: { route: MotionRoute; last: boolean; dur: number }[] = [
    { route: "normal", last: false, dur: 5 },
    { route: "cinematic", last: true, dur: 5 },
    { route: "cinematic_permissive", last: true, dur: 5 },
    { route: "lite", last: false, dur: 5 },
  ];
  for (const r of routes) {
    const t0 = Date.now();
    try {
      const buf = await generateMotionClip({
        route: r.route,
        prompt: PROMPT,
        firstFrameUrl,
        lastFrameUrl: r.last ? lastFrameUrl : undefined,
        aspectRatio: "16:9",
        durationSeconds: r.dur,
      });
      const file = join(OUT, `smoke-${r.route}.mp4`);
      writeFileSync(file, buf);
      console.log(
        `OK   ${r.route.padEnd(22)} ${((Date.now() - t0) / 1000).toFixed(0)}s ` +
          `${(buf.length / 1024).toFixed(0)}KB → ${file}`,
      );
    } catch (e) {
      console.log(`FAIL ${r.route.padEnd(22)} ${((Date.now() - t0) / 1000).toFixed(0)}s: ${(e as Error).message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
