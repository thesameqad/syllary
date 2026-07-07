import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  type AspectRatio,
  GROK_MAX_SECONDS,
  LITE_CLIP_MAX_SECONDS,
  LITE_CLIP_MIN_SECONDS,
  type VideoSegment,
} from "@syllary/shared";
import type { VideoJobRow } from "../db/schema.js";
import { env } from "../env.js";
import { presignGet, putObject } from "./r2.js";
import { generateLiteMotionClip } from "./fal-video.js";
import { generateMotionClip } from "./openrouter-video.js";
import { falQueueImage, lyricTextLooksRight, SNAPPY_ATTEMPTS_MS } from "./fal-image.js";

// ---------------------------------------------------------------------------
// Shared-clip "plates" scenes (Living Scenes only): ONE text-free base image +
// ONE looping motion clip covering the whole scene window, with each lyric line
// delivered as a styled TYPOGRAPHY STICKER (Qwen t2i card on solid black,
// luma-keyed to transparency) composited on its sung timing. Mask inpainting
// was tried first (probe Jul 2026) and dropped: it truncated long lines and
// slanted them along scene surfaces. QC failures flip the whole scene to
// "overlay" (timed ASS subtitles) so a bad generation day can never block a
// render.
// ---------------------------------------------------------------------------

/** Thrown (verbatim, user-facing) when fal's image queue stalls mid-plates —
 *  transient: the caller persists any finished plates and the user retries. */
export const PLATES_QUEUE_BUSY =
  "The image model's queue is busy right now — try again in a minute. Finished lyric plates were kept.";

const exec = promisify(execFile);
const require = createRequire(import.meta.url);

function ffmpegBin(): string {
  return env.FFMPEG_PATH || (require("ffmpeg-static") as string);
}

/** Typography cards render on this canvas (≤1MP — pins the card price and
 *  keeps every sticker dimension deterministic). */
const PLATE_CANVAS: Record<AspectRatio, { w: number; h: number }> = {
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720, h: 1280 },
  "1:1": { w: 1000, h: 1000 },
};

/** Distill the job's scene-flavored art direction into a LETTERING-ONLY hint
 *  (cached per job). Feeding the raw style description to the card generator
 *  re-invites the whole scene — signs, streets, reflections — and starves the
 *  text of room (bake-off Jul 6). Any failure → a safe generic treatment. */
const letteringCache = new Map<string, string>();
async function letteringStyleFor(job: VideoJobRow): Promise<string> {
  const cached = letteringCache.get(job.id);
  if (cached) return cached;
  const fallback = "elegant luminous glowing letters";
  let style = fallback;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        max_tokens: 40,
        messages: [
          {
            role: "user",
            content:
              `Art direction for a lyric video: "${job.styleDescription}". In at most 12 words, ` +
              `describe ONLY a matching text lettering treatment (material, color, glow). ` +
              `No scene elements. Example: glowing cyan neon tube letters with soft magenta rim. ` +
              `Reply with only the description.`,
          },
        ],
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const reply = data.choices?.[0]?.message?.content?.trim().replace(/^["']|["'.]$/g, "");
      if (reply) style = reply.slice(0, 120);
    }
  } catch {
    // fall through to the generic treatment
  }
  letteringCache.set(job.id, style);
  return style;
}

/** Typography-card prompt: pure styled text on solid black. Qwen t2i renders
 *  full-width straight typography far more reliably than mask inpainting
 *  (which truncated long lines and slanted them along scene surfaces). */
function cardPrompt(lettering: string, line: string): string {
  return (
    `Typography design on a solid pure black background: the words "${line}" in ${lettering}, ` +
    `written straight and horizontally centered, large, filling the width with margins, ` +
    `wrapped onto two lines if needed. Solid black everywhere else — no scenery, no signs, ` +
    `no shapes, no frame, no reflections, only the glowing words. No quotation marks drawn.`
  );
}

/** Luma-key the card into a full-canvas RGBA sticker: the background is true
 *  black, so alpha = brightness (soft ramp keeps the glow falloff). */
async function lumaExtractSticker(
  cardFile: string,
  aspectRatio: AspectRatio,
  outFile: string,
): Promise<void> {
  const { w, h } = PLATE_CANVAS[aspectRatio];
  await exec(ffmpegBin(), [
    "-y", "-i", cardFile,
    "-filter_complex",
    `[0:v]scale=${w}:${h},format=rgb24,split=2[c][l];` +
      `[l]format=gray,lutyuv=y='if(gt(val,30),255,val*4)',boxblur=luma_radius=1:luma_power=1[a];` +
      `[c][a]alphamerge[out]`,
    "-map", "[out]", "-frames:v", "1", outFile,
  ]);
}

/** Composite the line plates over the loop clip at their sung times (with alpha
 *  fades), producing the scene's final fitted clip. */
export async function overlayPlatesOnClip(opts: {
  workDir: string;
  loopFile: string;
  plates: { file: string; start: number; end: number }[];
  aspectRatio: AspectRatio;
  canvasW: number;
  canvasH: number;
  outName: string;
}): Promise<void> {
  const inputs: string[] = ["-i", path.basename(opts.loopFile)];
  // Each sticker PNG must become a TIMED stream (-loop 1 -t …): a bare image
  // input is a single frame at t=0, which the alpha fade-in renders ~fully
  // transparent — and overlay then holds that invisible frame for the whole
  // enable window. Loop just past the fade-out so the fades have frames.
  for (const p of opts.plates) {
    inputs.push("-loop", "1", "-t", (p.end + 0.3).toFixed(3), "-i", path.basename(p.file));
  }
  const parts: string[] = [];
  let cur = "[0:v]";
  opts.plates.forEach((p, k) => {
    const fadeIn = Math.max(0, p.start);
    const fadeOutAt = Math.max(fadeIn, p.end - 0.18);
    parts.push(
      // Stickers are full-canvas RGBA (transparent outside the glow) — scale to
      // the render canvas and lay them at the origin.
      `[${k + 1}:v]format=rgba,scale=${opts.canvasW}:${opts.canvasH},` +
        `fade=in:st=${fadeIn.toFixed(3)}:d=0.18:alpha=1,fade=out:st=${fadeOutAt.toFixed(3)}:d=0.18:alpha=1[p${k}]`,
    );
    const next = k === opts.plates.length - 1 ? "[v]" : `[v${k}]`;
    parts.push(
      `${cur}[p${k}]overlay=0:0:enable='between(t,${p.start.toFixed(3)},${p.end.toFixed(3)})'${next}`,
    );
    cur = next === "[v]" ? "[v]" : `[v${k}]`;
  });
  await exec(
    ffmpegBin(),
    [
      "-y", ...inputs,
      "-filter_complex", parts.join(";"),
      "-map", "[v]",
      "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      opts.outName,
    ],
    { cwd: opts.workDir, maxBuffer: 64 * 1024 * 1024 },
  );
}

/** Ping-pong the raw motion clip and tile it to span the whole scene window. */
export async function loopFillClip(opts: {
  workDir: string;
  inFile: string;
  outName: string;
  spanSeconds: number;
  canvasW: number;
  canvasH: number;
}): Promise<void> {
  const pingpong = path.join(opts.workDir, `pp_${path.basename(opts.outName)}`);
  await exec(
    ffmpegBin(),
    [
      "-y", "-i", opts.inFile,
      "-filter_complex", "[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]",
      "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", pingpong,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  await exec(
    ffmpegBin(),
    [
      "-y", "-stream_loop", "-1", "-i", pingpong,
      "-t", Math.max(0.4, opts.spanSeconds).toFixed(3),
      "-vf",
      `scale=${opts.canvasW}:${opts.canvasH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${opts.canvasW}:${opts.canvasH},fps=25,format=yuv420p`,
      "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      path.join(opts.workDir, opts.outName),
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
}

/** The valid generated-loop length range for a plates scene (before ping-pong
 *  tiling), given the job's motion model. */
export function loopSecondsRange(job: VideoJobRow): { min: number; max: number } {
  return job.imageQuality === "lite"
    ? { min: LITE_CLIP_MIN_SECONDS, max: LITE_CLIP_MAX_SECONDS }
    : { min: 1, max: GROK_MAX_SECONDS };
}

/** Generate ONLY the bare motion loop for a plates scene: one clip at the
 *  chosen (or max) generatable length, ping-pong-tiled to the scene window and
 *  uploaded. Sets clipKey to the BARE loop (platesApplied=false) so the user
 *  can preview and iterate on the motion cheaply before applying the lyrics.
 *  Mutates `seg`; persistence is the caller's job. */
export async function materializeLoopClip(opts: {
  job: VideoJobRow;
  seg: VideoSegment;
  aspectRatio: AspectRatio;
  workDir: string;
  motionPrompt: string;
  canvasW: number;
  canvasH: number;
}): Promise<string> {
  const { job, seg, aspectRatio, workDir } = opts;
  const span = seg.clipEnd - seg.clipStart;

  const { min, max } = loopSecondsRange(job);
  const wanted = seg.loopSeconds ?? Math.ceil(Math.min(span, max));
  const genDur = Math.min(max, Math.max(min, Math.ceil(wanted)));
  const baseUrl = seg.imageKey ? await presignGet(seg.imageKey) : null;
  if (!baseUrl) throw new Error(`Scene ${seg.index} has no base image.`);
  const raw =
    job.imageQuality === "lite"
      ? await generateLiteMotionClip({
          prompt: opts.motionPrompt,
          firstFrameUrl: baseUrl,
          aspectRatio,
          durationSeconds: genDur,
        })
      : await generateMotionClip({
          model: env.OPENROUTER_VIDEO_MODEL,
          prompt: opts.motionPrompt,
          firstFrameUrl: baseUrl,
          aspectRatio,
          durationSeconds: genDur,
          resolution: "720p",
        });
  const rawFile = path.join(workDir, `plraw_${seg.index}.mp4`);
  await writeFile(rawFile, raw);
  const loopName = `loop_${seg.index}.mp4`;
  await loopFillClip({
    workDir,
    inFile: rawFile,
    outName: loopName,
    spanSeconds: span,
    canvasW: opts.canvasW,
    canvasH: opts.canvasH,
  });
  const loopFile = path.join(workDir, loopName);
  const loopKey = `video/${job.songId}/${job.id}/loop_${seg.index}.mp4`;
  await putObject(loopKey, await readFile(loopFile), "video/mp4");
  seg.loopClipKey = loopKey;
  seg.clipKey = loopKey; // preview the bare loop until the lyrics are applied
  seg.clipStatus = "ready";
  seg.platesApplied = false;
  return loopName;
}

/** Apply the lyric plates to an ALREADY-GENERATED loop: generate any missing
 *  typography stickers (existing ones are reused — they don't depend on the
 *  loop), composite them on their sung timing, upload as the scene's fitted
 *  clip. When any line exhausts its retries the scene FLIPS to "overlay" — the
 *  assembly burns timed subtitles instead. Mutates `seg`; persistence is the
 *  caller's job. Returns the fitted clip's local filename. */
export async function applyPlatesToLoop(opts: {
  job: VideoJobRow;
  seg: VideoSegment;
  aspectRatio: AspectRatio;
  workDir: string;
  canvasW: number;
  canvasH: number;
  outName: string;
}): Promise<string> {
  const { job, seg, aspectRatio, workDir, outName } = opts;
  const lines = seg.lines ?? [];
  if (!seg.loopClipKey) throw new Error(`Scene ${seg.index} has no loop clip yet.`);
  const loopFile = path.join(workDir, `loop_${seg.index}.mp4`);
  {
    const res = await fetch(await presignGet(seg.loopClipKey));
    if (!res.ok) throw new Error(`Could not fetch the loop clip (HTTP ${res.status}).`);
    await writeFile(loopFile, Buffer.from(await res.arrayBuffer()));
  }

  // Per-line typography card (Qwen t2i: styled text on solid black — far
  //    more reliable than mask inpainting, which truncated long lines and
  //    slanted them along scene surfaces) → luma-keyed sticker → QC (transcribe
  //    + compare in code, 2 retries: generation is stochastic). Lines run in
  //    PARALLEL (cap 3): a cold fal queue can cost 100s+ per call.
  const lettering = await letteringStyleFor(job);
  const { w: cw, h: ch } = PLATE_CANVAS[aspectRatio];
  // Two DISTINCT failure modes: qcFailed = the model can't render this text
  // (deterministic-ish → overlay fallback); infraFailed = fal's queue stalled /
  // errored (transient → abort WITHOUT the fallback, keep what succeeded, and
  // let the user simply retry in a minute).
  let qcFailed = false;
  let infraFailed = false;
  const makePlate = async (k: number): Promise<void> => {
    const line = lines[k]!;
    if (!line.text.trim()) return;
    const finishedPlate = path.join(workDir, `plate_${seg.index}_${k}.png`);
    if (line.plateKey) {
      // A sticker already exists (edit jobs copy segments, and typography
      // doesn't depend on the loop) — materialize it locally for the composite
      // instead of re-generating. If it vanished from R2, regenerate below.
      try {
        const res = await fetch(await presignGet(line.plateKey));
        if (res.ok) {
          await writeFile(finishedPlate, Buffer.from(await res.arrayBuffer()));
          return;
        }
      } catch {
        // fall through to regeneration
      }
      line.plateKey = null;
    }
    for (let attempt = 0; attempt < 3 && !line.plateKey && !qcFailed && !infraFailed; attempt++) {
      let card: Buffer;
      try {
        // Snappy deadlines: this runs behind the editor's Apply-lyrics button —
        // fail fast (~45s per submit, 3 submits) instead of holding the user
        // for minutes on a stuck queue.
        card = await falQueueImage(
          "fal-ai/qwen-image",
          {
            prompt: cardPrompt(lettering, line.text),
            image_size: { width: cw, height: ch },
            num_images: 1,
          },
          { attemptsMs: SNAPPY_ATTEMPTS_MS },
        );
      } catch (err) {
        // falQueueImage already retried with resubmits — a throw here means the
        // queue is genuinely stuck. Don't burn more attempts on it.
        console.warn(
          `[plates] seg=${seg.index} line=${k} card generation failed:`,
          err instanceof Error ? err.message : err,
        );
        infraFailed = true;
        return;
      }
      const cardFile = path.join(workDir, `plcard_${seg.index}_${k}.png`);
      await writeFile(cardFile, card);
      const plateFile = path.join(workDir, `plate_${seg.index}_${k}.png`);
      await lumaExtractSticker(cardFile, aspectRatio, plateFile);
      // QC the extracted sticker (text on transparency): catches BOTH a wrong
      // card and a failed extraction in one check.
      if (await lyricTextLooksRight(await readFile(plateFile), line.text)) {
        const plateKey = `video/${job.songId}/${job.id}/plate_${seg.index}_${k}.png`;
        await putObject(plateKey, await readFile(plateFile), "image/png");
        line.plateKey = plateKey;
      }
    }
    if (line.text.trim() && !line.plateKey && !infraFailed) qcFailed = true;
  };
  const pending = [...lines.keys()];
  await Promise.all(
    Array.from({ length: Math.min(3, lines.length) }, async () => {
      while (pending.length > 0 && !qcFailed && !infraFailed) await makePlate(pending.shift()!);
    }),
  );
  if (infraFailed) {
    // Successful plateKeys stay on `seg` — the caller persists them so a retry
    // reuses them for free instead of regenerating.
    throw new Error(PLATES_QUEUE_BUSY);
  }
  const plates = [...lines.entries()]
    .filter(([, l]) => l.plateKey)
    .map(([k, l]) => ({
      file: path.join(workDir, `plate_${seg.index}_${k}.png`),
      start: Math.max(0, l.start - seg.clipStart),
      end: Math.max(0.4, l.end - seg.clipStart),
    }));

  // Deterministic safety net: any line exhausting its retries flips the WHOLE
  // scene to timed-subtitle overlay on the bare loop. The render can't be blocked.
  if (qcFailed) {
    console.warn(`[plates] seg=${seg.index} QC failed twice — falling back to overlay`);
    seg.textMode = "overlay";
    for (const l of lines) l.plateKey = null;
    const { copyFile } = await import("node:fs/promises");
    await copyFile(loopFile, path.join(workDir, outName));
    const clipKey = `video/${job.songId}/${job.id}/clip_${seg.index}.mp4`;
    await putObject(clipKey, await readFile(loopFile), "video/mp4");
    seg.clipKey = clipKey;
    seg.clipStatus = "ready";
    return outName;
  }

  // Composite the plates over the loop → the scene's final fitted clip.
  await overlayPlatesOnClip({
    workDir,
    loopFile,
    plates,
    aspectRatio,
    canvasW: opts.canvasW,
    canvasH: opts.canvasH,
    outName,
  });
  const clipKey = `video/${job.songId}/${job.id}/clip_${seg.index}.mp4`;
  await putObject(clipKey, await readFile(path.join(workDir, outName)), "video/mp4");
  seg.clipKey = clipKey;
  seg.clipStatus = "ready";
  seg.platesApplied = true;
  return outName;
}

/** Build a plates scene end-to-end for autopilot/finalize: reuse the stored
 *  loop when one exists (the user may have generated it in review — the motion
 *  is the expensive part), else generate it, then apply the lyric plates. */
export async function materializePlatesClip(opts: {
  job: VideoJobRow;
  seg: VideoSegment;
  aspectRatio: AspectRatio;
  workDir: string;
  motionPrompt: string;
  canvasW: number;
  canvasH: number;
  outName: string;
}): Promise<string> {
  if (!opts.seg.loopClipKey) {
    await materializeLoopClip(opts);
  }
  try {
    return await applyPlatesToLoop(opts);
  } catch (err) {
    // A stale loopClipKey (object gone from R2) is recoverable: regenerate the
    // loop once and retry the plates.
    if (opts.seg.loopClipKey && /loop clip/i.test(err instanceof Error ? err.message : "")) {
      await materializeLoopClip(opts);
      return applyPlatesToLoop(opts);
    }
    throw err;
  }
}
