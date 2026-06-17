import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import os from "node:os";
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

/** Output framerate for the Slideshow stitch. The frames are STATIC (no motion
 *  since the Ken-Burns zoom was removed), so a low fps is visually identical but
 *  encodes far fewer frames — the encode is the whole bottleneck on a 2-core box.
 *  12 keeps scene-cut timing tight (~83ms) while cutting frame count >2x vs 25. */
const SLIDESHOW_FPS = 12;

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

/** The outcome of a duration probe: `seconds` when read, else null with a `detail`
 *  string explaining exactly what failed (spawn error, ffmpeg stderr, HTTP status) —
 *  so callers can surface a real reason to logs/Sentry instead of a silent null. */
export type ProbeResult = { seconds: number | null; detail: string };

/** Spawn ffmpeg on one input (local path OR url) and parse its "Duration:" line.
 *  `ffmpeg -i <input>` with no output exits non-zero by design; we only want the
 *  "Duration: HH:MM:SS.cc" line it prints while inspecting the input. */
function probeOnce(input: string, timeoutMs: number): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath(), ["-hide_banner", "-i", input], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 16_000) stderr = stderr.slice(-16_000);
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      // ENOENT here means the ffmpeg binary itself is missing / not executable.
      resolve({ seconds: null, detail: `spawn failed (${(err as NodeJS.ErrnoException).code ?? "?"}): ${err.message}` });
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      const m = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
      if (!m) {
        return resolve({ seconds: null, detail: `ffmpeg exit ${code}, no Duration line. stderr: ${stderr.trim().slice(-600) || "(empty)"}` });
      }
      const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      if (!(Number.isFinite(seconds) && seconds > 0)) {
        return resolve({ seconds: null, detail: `non-positive duration parsed from "${m[0]}"` });
      }
      resolve({ seconds, detail: "ok" });
    });
  });
}

/** Measure a media file's duration — the AUTHORITATIVE value for token pricing (the
 *  client-supplied value at presign time is a hint only and must never price a job).
 *
 *  Tries ffmpeg on the input directly first (works for local paths and, on most
 *  hosts, remote URLs). If that fails for a remote URL, falls back to downloading the
 *  bytes with Node and probing the local copy: some container runtimes don't let the
 *  ffmpeg process egress over HTTPS even when Node can (separate CA store / DNS), and
 *  Node-download-then-ffmpeg-local-file is the same path the rest of the pipeline
 *  already uses for every R2 object — so duration pricing keeps working regardless of
 *  ffmpeg's own network stack. Returns the seconds and a `detail` describing any
 *  failure (covering BOTH attempts) for the caller to log/report. */
export async function probeDurationSeconds(input: string, timeoutMs = 30_000): Promise<ProbeResult> {
  const direct = await probeOnce(input, timeoutMs);
  if (direct.seconds !== null) return direct;
  if (!/^https?:\/\//i.test(input)) return direct;

  const tmp = path.join(os.tmpdir(), `syllary-probe-${process.pid}-${Date.now()}.bin`);
  try {
    const res = await fetch(input, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      return { seconds: null, detail: `direct[${direct.detail}] | fallback download HTTP ${res.status}` };
    }
    await writeFile(tmp, Buffer.from(await res.arrayBuffer()));
    const local = await probeOnce(tmp, timeoutMs);
    if (local.seconds !== null) return local;
    return { seconds: null, detail: `direct[${direct.detail}] | fallback-local[${local.detail}]` };
  } catch (e) {
    return { seconds: null, detail: `direct[${direct.detail}] | fallback fetch errored: ${(e as Error).message}` };
  } finally {
    await rm(tmp, { force: true }).catch(() => undefined);
  }
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

/** Run ffmpeg with the input piped to stdin and the output captured from stdout —
 *  an in-memory image transform with no temp files in the hot generation path. */
function runFfmpegPipe(args: string[], input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ["-hide_banner", "-loglevel", "error", ...args]);
    const out: Buffer[] = [];
    let stderr = "";
    proc.stdout.on("data", (d) => out.push(d as Buffer));
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().slice(-1000)}`));
    });
    // ffmpeg may close stdin before we finish writing (e.g. on a tiny image); swallow
    // the resulting EPIPE so it surfaces as the real exit-code error instead.
    proc.stdin.on("error", () => {});
    proc.stdin.write(input);
    proc.stdin.end();
  });
}

/** Normalize a generated frame to ONE uniform baseline JPEG before it's stored.
 *  The image model hands back whatever it likes per call — sometimes PNG, sometimes
 *  JPEG, with varying sample-aspect/pixel-format metadata. The slideshow stitch
 *  concatenates these stills in a single ffmpeg pass, and any such variation either
 *  can't be decoded (the concat demuxer locks to the first frame's codec, so a later
 *  JPEG under a PNG decoder is dropped) or forces a mid-stream filtergraph reinit
 *  that drops a frame. Standardizing on ingest — square SAR + fixed pixel format,
 *  re-encoded as JPEG — makes every frame identical in "shape" (and small on R2), so
 *  the fast single-pass stitch keeps every image. Native resolution is preserved;
 *  the stitch scales/crops to the canvas. */
export async function normalizeFrameToJpeg(input: Buffer): Promise<Buffer> {
  return runFfmpegPipe(
    [
      "-y",
      "-i", "pipe:0",
      "-frames:v", "1",
      "-vf", "setsar=1,format=yuvj420p",
      "-c:v", "mjpeg",
      "-q:v", "3",
      "-f", "image2pipe",
      "pipe:1",
    ],
    input,
  );
}

/** Produce a download variant from a finished master mp4: scale to `height`
 *  (never upscaling) and optionally bake the Syllary logo top-right. Re-encodes
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
  // Cap threads to the container's cores, exactly like the slideshow stitch: ffmpeg
  // otherwise spawns one thread per HOST core on Render's shared host and thrashes
  // the small cgroup, making this re-encode several times slower than the work itself.
  const enc = [
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
    "-threads", "2",
    "-c:a", "copy", "-movflags", "+faststart",
  ];
  let args: string[];
  if (opts.watermark) {
    // ~9% of frame height: the watermark doubles as the ad on shared/YouTube
    // videos, so "syllary.com" must survive mobile sizes after compression.
    const logoH = Math.round(h * 0.09);
    const margin = Math.round(h * 0.03);
    // Top-right, NOT bottom-right: the bottom-right corner is buried under the player
    // control bar (scrubber/fullscreen) and YouTube's end-screen cards, so the logo
    // got covered in every player. The top edge stays clear during playback; we keep
    // right-alignment so it doesn't fight the title YouTube shows top-left on hover.
    const fc =
      `[0:v]${scale}[bg];` +
      `[1:v]scale=-1:${logoH}[wm];` +
      `[bg][wm]overlay=W-w-${margin}:${margin}[v]`;
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

/**
 * Stitch a lyric video from per-line still frames (each already containing its lyric
 * text, rendered by the image model) in a SINGLE ffmpeg pass: the concat demuxer holds
 * each frame for its on-screen window, one encode scales/crops to the canvas and
 * resamples to a low static fps, and the song audio is muxed in the same pass.
 * (Slideshow frames are static — the Ken-Burns zoom was removed; it's in git history.)
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
  const t0 = Date.now();
  console.log(`[stitch] START clips=${sorted.length} @ ${w}x${h} single-pass fps=${SLIDESHOW_FPS}`);

  // ONE ffmpeg pass instead of ~120. The concat demuxer holds each still for its
  // on-screen duration; a single encode scales/crops to the canvas, resamples to a
  // low (static) fps, and muxes the song audio. Per-clip encoding was the entire
  // bottleneck — each of ~120 ffmpeg spawns over-spawned threads (one per HOST core,
  // but the container is ~2 cores) and thrashed the CPU. The concat demuxer DROPS the
  // final entry's duration, so the last frame is repeated to hold it on screen.
  const lines: string[] = [];
  for (const seg of sorted) {
    const dur = Math.max(0.4, seg.clipEnd - seg.clipStart);
    lines.push(`file '${path.basename(seg.imageFile)}'`, `duration ${dur.toFixed(3)}`);
  }
  const last = sorted[sorted.length - 1];
  if (last) lines.push(`file '${path.basename(last.imageFile)}'`);
  await writeFile(path.join(workDir, "images.txt"), lines.join("\n"), "utf8");

  const outName = path.basename(outFile);
  await runFfmpeg(
    [
      "-y",
      "-f", "concat", "-safe", "0", "-i", "images.txt",
      ...(opts.audioStartSeconds ? ["-ss", opts.audioStartSeconds.toFixed(3)] : []),
      "-i", path.basename(audioFile),
      "-map", "0:v",
      "-map", "1:a",
      "-vf",
      `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},format=yuv420p`,
      // Resample to a constant fps at the OUTPUT stage, NOT with an in-graph `fps`
      // filter. The per-line PNGs from the image model are NOT all the same pixel
      // size, and any size change makes ffmpeg REINITIALIZE the filtergraph. An
      // in-graph `fps` filter drops the single frame it has buffered on every
      // reinit, so one image per size-change silently vanished from the video
      // (~30% of frames went missing in practice). scale/crop/format are stateless
      // 1-in-1-out filters that survive reinit cleanly; doing CFR here (via the
      // encoder's vsync, which tracks output PTS continuously) duplicates stills to
      // ${SLIDESHOW_FPS}fps without dropping any.
      "-r", String(SLIDESHOW_FPS),
      "-fps_mode", "cfr",
      // Cap threads to the container's cores — ffmpeg otherwise spawns one per HOST
      // core (many on Render's shared host) and thrashes the ~2-core cgroup.
      "-threads", "2",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "20",
      "-c:a", "aac",
      "-b:a", "192k",
      "-shortest",
      "-movflags", "+faststart",
      outName,
    ],
    workDir,
  );

  // The per-line frames are baked in now — free them (keeps /tmp bounded).
  await Promise.all(sorted.map((s) => rm(path.join(workDir, path.basename(s.imageFile)), { force: true })));
  console.log(`[stitch] DONE single-pass ms=${Date.now() - t0}`);

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
