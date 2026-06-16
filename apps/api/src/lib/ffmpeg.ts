import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AspectRatio } from "@syllary/shared";
import { env } from "../env.js";

const require = createRequire(import.meta.url);

/** The Syllary watermark PNG (transparent), baked into downloads on demand.
 *  This module sits at different depths in dev (apps/api/src/lib/ffmpeg.ts) vs the
 *  bundled prod build (tsup flattens everything into apps/api/dist/index.js), so a
 *  single fixed relative path can't reach apps/api/assets in both — the old
 *  `../../assets` pointed at apps/assets in prod, so ffmpeg failed and watermarked
 *  downloads hung forever. Probe the known candidates (+ cwd) and take the first
 *  that exists. */
function resolveWatermarkPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../assets/watermark.png"), // dev: apps/api/src/lib → apps/api/assets
    path.resolve(here, "../assets/watermark.png"), // prod bundle: apps/api/dist → apps/api/assets
    path.resolve(process.cwd(), "assets/watermark.png"), // process cwd = apps/api
    path.resolve(process.cwd(), "apps/api/assets/watermark.png"), // cwd = repo root
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

export const WATERMARK_PATH = resolveWatermarkPath();

/** Resolve the ffmpeg binary: explicit override, else the bundled static build
 *  (a precompiled binary in node_modules — no Docker/apt needed on Render). */
function ffmpegPath(): string {
  if (env.FFMPEG_PATH) return env.FFMPEG_PATH;
  const fromStatic = require("ffmpeg-static") as string | null;
  if (!fromStatic) throw new Error("ffmpeg binary not found (ffmpeg-static missing).");
  return fromStatic;
}

const FPS = 25;

/** How many per-scene clips to encode in parallel during the slideshow stitch.
 *  Each ffmpeg is single-threaded (-threads 1), so running a few at once saturates
 *  a multi-core box — one-at-a-time left every core but one idle. 4 is safe on the
 *  Pro instance (2 vCPU / 4 GB) and bounds peak memory on long songs. */
const STITCH_CONCURRENCY = 4;

const DIMENSIONS: Record<AspectRatio, { w: number; h: number }> = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
};

/** One frame (a Nano Banana image with the lyric already rendered into it) and
 *  the window it's on screen for. */
export type StitchSegment = {
  index: number;
  imageFile: string;
  clipStart: number;
  clipEnd: number;
};

/** Measure a media file's duration by letting ffmpeg read the container header
 *  (no decode, no output file — works directly on a presigned R2 URL). This is
 *  the AUTHORITATIVE duration for token pricing: the client-supplied value at
 *  presign time is a hint only and must never price a job. Returns seconds, or
 *  null when the input can't be read or reports no duration. */
export function probeDurationSeconds(input: string, timeoutMs = 30_000): Promise<number | null> {
  return new Promise((resolve) => {
    // `ffmpeg -i <input>` with no output exits non-zero by design; we only
    // want the "Duration: HH:MM:SS.cc" line it prints while inspecting input.
    const proc = spawn(ffmpegPath(), ["-hide_banner", "-i", input], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 16_000) stderr = stderr.slice(-16_000);
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on("close", () => {
      clearTimeout(timer);
      const m = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
      if (!m) return resolve(null);
      const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      resolve(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
    });
  });
}

function runFfmpeg(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ["-hide_banner", "-loglevel", "error", ...args], { cwd });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().slice(-1000)}`));
    });
  });
}

/** Produce a download variant from a finished master mp4: scale to `height`
 *  (never upscaling) and optionally bake the Syllary logo bottom-right. Re-encodes
 *  the video; copies the audio stream untouched. Returns the output path. */
export async function transcodeForDownload(opts: {
  workDir: string;
  inName: string;
  outName: string;
  height: number;
  watermark: boolean;
  logoPath?: string;
}): Promise<string> {
  const h = Math.round(opts.height);
  // Escaped comma so min()'s arg list isn't read as a filter separator. Never
  // upscale: cap the output height at the source height.
  const scale = `scale=-2:min(ih\\,${h})`;
  // Downloads are disposable derivatives and the FIRST request blocks on this
  // transcode, so encode for speed: ultrafast (~2x faster than veryfast on a small
  // CPU) + crf 23 keeps a still-shareable 1080p file at a sane size. Audio copied.
  const enc = ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-c:a", "copy", "-movflags", "+faststart"];
  let args: string[];
  if (opts.watermark) {
    // ~9% of frame height: the watermark doubles as the ad on shared/YouTube
    // videos, so "syllary.com" must survive mobile sizes after compression.
    const logoH = Math.round(h * 0.09);
    const margin = Math.round(h * 0.03);
    const fc =
      `[0:v]${scale}[bg];` +
      `[1:v]scale=-1:${logoH}[wm];` +
      `[bg][wm]overlay=W-w-${margin}:H-h-${margin}[v]`;
    args = [
      "-y",
      "-i", opts.inName,
      "-i", opts.logoPath ?? WATERMARK_PATH,
      "-filter_complex", fc,
      "-map", "[v]",
      "-map", "0:a",
      ...enc,
      opts.outName,
    ];
  } else {
    args = ["-y", "-i", opts.inName, "-vf", scale, "-map", "0:v", "-map", "0:a", ...enc, opts.outName];
  }
  await runFfmpeg(args, opts.workDir);
  return path.join(opts.workDir, opts.outName);
}

/** Slideshow frames are shown STATICALLY for now — the gentle Ken-Burns zoom was
 *  removed (it read as not-quite-smooth and the `zoompan` filter was by far the
 *  slowest part of the stitch). Just scale + center-crop the image to fill the
 *  canvas, no motion. The previous zoom lives in git history to restore later. */
function stillFrame(w: number, h: number): string {
  return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},format=yuv420p`;
}

/**
 * Stitch a lyric video from per-line frames (each already containing its lyric
 * text, rendered by the image model):
 *  1. render a gentle Ken-Burns clip per frame (tiling the full timeline),
 *  2. concat them,
 *  3. mux the original song audio.
 * Returns the absolute path to the finished MP4.
 */
export async function stitchLyricsVideo(opts: {
  workDir: string;
  segments: StitchSegment[];
  audioFile: string;
  aspectRatio: AspectRatio;
  outFile: string;
  /** Seek the song this many seconds in before muxing (preview windows). */
  audioStartSeconds?: number;
}): Promise<string> {
  const { workDir, segments, audioFile, aspectRatio, outFile } = opts;
  const { w, h } = DIMENSIONS[aspectRatio];
  const sorted = [...segments].sort((a, b) => a.clipStart - b.clipStart);

  // 1. Per-frame Ken-Burns clips, rendered with bounded parallelism. Each encode is
  //    single-threaded + zoompan-bound, so a few at once saturate the box instead of
  //    leaving cores idle. clipNames is filled BY INDEX so concat keeps timeline order.
  const clipNames: string[] = new Array(sorted.length);
  let cursor = 0;
  const renderWorker = async (): Promise<void> => {
    for (;;) {
      const i = cursor++; // synchronous grab — no await between read + increment, so unique per worker
      const seg = sorted[i];
      if (!seg) return;
      const dur = Math.max(0.4, seg.clipEnd - seg.clipStart);
      const clipName = `clip_${seg.index}.mp4`;
      await runFfmpeg(
        [
          "-y",
          "-loop", "1",
          "-i", path.basename(seg.imageFile),
          "-t", dur.toFixed(3),
          "-vf", stillFrame(w, h),
          "-r", String(FPS),
          "-threads", "1",
          "-c:v", "libx264",
          "-preset", "superfast",
          "-crf", "20",
          clipName,
        ],
        workDir,
      );
      clipNames[i] = clipName;
      // The source frame is encoded — free it now (keeps /tmp bounded on long songs).
      await rm(seg.imageFile, { force: true });
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(sorted.length, STITCH_CONCURRENCY) }, () => renderWorker()),
  );

  // 2. Concat the clips (identical encode params → stream copy is safe).
  const listName = "clips.txt";
  await writeFile(
    path.join(workDir, listName),
    clipNames.map((c) => `file '${c}'`).join("\n"),
    "utf8",
  );
  const concatName = "concat.mp4";
  await runFfmpeg(
    ["-y", "-f", "concat", "-safe", "0", "-i", listName, "-c", "copy", concatName],
    workDir,
  );
  // Per-clip files are now baked into concat — drop them before the audio mux.
  await Promise.all(clipNames.map((c) => rm(path.join(workDir, c), { force: true })));

  // 3. Mux the real song audio onto the stitched video.
  const outName = path.basename(outFile);
  await runFfmpeg(
    [
      "-y",
      "-i", concatName,
      ...(opts.audioStartSeconds ? ["-ss", opts.audioStartSeconds.toFixed(3)] : []),
      "-i", audioFile,
      "-map", "0:v",
      "-map", "1:a",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "192k",
      "-shortest",
      "-movflags", "+faststart",
      outName,
    ],
    workDir,
  );
  await rm(path.join(workDir, concatName), { force: true });

  return path.join(workDir, outName);
}

/** Normalize an AI-generated clip to an exact duration and our canvas: trims if
 *  longer, freezes the last frame if shorter (tpad). Used by Living Scenes,
 *  where each generated clip must fill its lyric line's window precisely. */
export async function fitClipToDuration(opts: {
  workDir: string;
  inFile: string;
  outName: string;
  durationSeconds: number;
  aspectRatio: AspectRatio;
}): Promise<void> {
  const { w, h } = DIMENSIONS[opts.aspectRatio];
  const dur = Math.max(0.4, opts.durationSeconds).toFixed(3);
  await runFfmpeg(
    [
      "-y",
      "-i", path.basename(opts.inFile),
      "-vf",
      `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=${FPS},tpad=stop_mode=clone:stop_duration=${dur},format=yuv420p`,
      "-t", dur,
      "-an",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      opts.outName,
    ],
    opts.workDir,
  );
}

/** Time-scale a clip to an exact duration by rescaling its PTS (speed up/slow
 *  down) rather than trimming — so the FIRST and LAST frames are preserved.
 *  Used by Cinematic, where the clip must still end on its last frame (= the
 *  next shot's first frame) for the seamless join, even when the lyric line is
 *  shorter than the model's minimum clip length. */
export async function speedFitClip(opts: {
  workDir: string;
  inFile: string;
  outName: string;
  targetSeconds: number;
  sourceSeconds: number;
  aspectRatio: AspectRatio;
}): Promise<void> {
  const { w, h } = DIMENSIONS[opts.aspectRatio];
  const target = Math.max(0.4, opts.targetSeconds);
  const factor = (target / Math.max(0.4, opts.sourceSeconds)).toFixed(5);
  await runFfmpeg(
    [
      "-y",
      "-i", path.basename(opts.inFile),
      "-vf",
      `setpts=${factor}*PTS,scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=${FPS},format=yuv420p`,
      "-t", target.toFixed(3),
      "-an",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      opts.outName,
    ],
    opts.workDir,
  );
}

/** Concat clips that share identical encode params (stream copy). */
export async function concatClips(
  workDir: string,
  clipNames: string[],
  outName: string,
): Promise<void> {
  await writeFile(
    path.join(workDir, "clips.txt"),
    clipNames.map((c) => `file '${c}'`).join("\n"),
    "utf8",
  );
  await runFfmpeg(
    ["-y", "-f", "concat", "-safe", "0", "-i", "clips.txt", "-c", "copy", outName],
    workDir,
  );
}

/** Mux the song audio onto a finished video. Audio starts at 0; optionally
 *  trims the whole thing to maxSeconds (used by the short AI-video previews). */
export async function muxAudio(opts: {
  workDir: string;
  videoName: string;
  audioFile: string;
  outName: string;
  maxSeconds?: number;
  /** Seek the song this many seconds in before muxing (preview windows). */
  audioStartSeconds?: number;
}): Promise<string> {
  const args = [
    "-y",
    "-i", opts.videoName,
    ...(opts.audioStartSeconds ? ["-ss", opts.audioStartSeconds.toFixed(3)] : []),
    "-i", opts.audioFile,
    "-map", "0:v",
    "-map", "1:a",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    ...(opts.maxSeconds ? ["-t", opts.maxSeconds.toFixed(3)] : []),
    "-movflags", "+faststart",
    opts.outName,
  ];
  await runFfmpeg(args, opts.workDir);
  return path.join(opts.workDir, opts.outName);
}

/** One lyric line with its on-screen window, for the subtitle overlay. */
export type LyricCue = { text: string; start: number; end: number };

function assTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.min(99, Math.round((s - Math.floor(s)) * 100));
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function assEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\N").replace(/[{}]/g, "");
}

/** Styled ASS subtitle track: large, lower-third, white with a strong outline +
 *  shadow so it stays readable over any moving scene; each line fades in/out. */
function buildAss(cues: LyricCue[], w: number, h: number): string {
  const fontSize = Math.round(h * 0.066);
  const marginV = Math.round(h * 0.09);
  const marginH = Math.round(w * 0.08);
  const outline = Math.max(2, Math.round(fontSize * 0.07));
  const shadow = Math.max(1, Math.round(fontSize * 0.04));
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,Sans,${fontSize},&H00FFFFFF,&H00FFFFFF,&H64000000,&H96000000,1,0,0,0,100,100,0,0,1,${outline},${shadow},2,${marginH},${marginH},${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events = cues
    .filter((c) => c.text.trim().length > 0 && c.end > c.start)
    .map(
      (c) =>
        `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,{\\fad(180,180)}${assEscape(c.text.trim())}`,
    );
  return [...header, ...events].join("\n");
}

/** Burn synced lyric text onto a finished video and mux the song audio in one
 *  pass. Used by Cinematic: Kling renders text-free motion, the crisp lyrics are
 *  overlaid here (so they never warp). Runs with cwd=workDir for bare filenames. */
export async function overlayLyricsAndMux(opts: {
  workDir: string;
  videoName: string;
  audioFile: string;
  cues: LyricCue[];
  aspectRatio: AspectRatio;
  outName: string;
  maxSeconds: number;
}): Promise<string> {
  const { w, h } = DIMENSIONS[opts.aspectRatio];
  await writeFile(path.join(opts.workDir, "lyrics.ass"), buildAss(opts.cues, w, h), "utf8");
  await runFfmpeg(
    [
      "-y",
      "-i", opts.videoName,
      "-i", opts.audioFile,
      "-filter_complex", "[0:v]ass=lyrics.ass[v]",
      "-map", "[v]",
      "-map", "1:a",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-t", opts.maxSeconds.toFixed(3),
      "-movflags", "+faststart",
      opts.outName,
    ],
    opts.workDir,
  );
  return path.join(opts.workDir, opts.outName);
}
