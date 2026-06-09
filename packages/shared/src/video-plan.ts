import type { CoverModel, ImageQuality, ImageSize, VideoModel } from "./constants.js";
import { PREVIEW_SECONDS, VIDEO_MODEL_INFO } from "./constants.js";
import type { Lyrics } from "./lyrics.js";
import type { VideoSegment } from "./video.js";

// ===========================================================================
// Segment planning — shared between the server pipeline (apps/api) and the
// generate modal (apps/web), so the price shown before "Generate" is computed
// from the SAME timeline the renderer will actually produce.
// ===========================================================================

// Grok clip duration limits (Living Scenes; it generates 1–15s clips).
export const GROK_MIN_SECONDS = 1;
export const GROK_MAX_SECONDS = 15;
// Cinematic model (Seedance) only generates 4–15s clips.
export const CINEMATIC_MIN_SECONDS = 4;
export const CINEMATIC_MAX_SECONDS = 15;
export const MIN_CLIP_SECONDS = 0.4;
// Instrumental stretches longer than this get their own text-free clip(s)
// rather than letting the previous line's frame linger.
export const GAP_SECONDS = 3;
// A long instrumental is split into chunks of at most this length, each its own
// scene, so the visuals keep changing instead of one clip looping for ages.
export const INSTRUMENTAL_CHUNK_SECONDS = 5;
// How long a line's frame holds after it's sung before an instrumental gap.
export const LINE_HOLD_SECONDS = 1.5;

/** Tile the song timeline into clips. Each lyric line gets a frame (with its
 *  text rendered in); a line's frame lingers through SHORT gaps to the next
 *  line, but a gap longer than GAP_SECONDS (intro, mid-song break, outro) gets
 *  its own text-free instrumental frame so the previous line doesn't hang on. */
export function buildSegments(lyrics: Lyrics, durationSeconds: number | null): VideoSegment[] {
  const lines = lyrics.lines
    .filter((l) => l.text.trim().length > 0)
    .slice()
    .sort((a, b) => a.start - b.start);
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (!first || !last) return [];

  const total = Math.max(durationSeconds ?? 0, last.end + LINE_HOLD_SECONDS, first.start + MIN_CLIP_SECONDS);

  const segs: VideoSegment[] = [];
  let lastEnd = 0;
  const push = (clipEnd: number, text: string, sungStart: number, sungEnd: number) => {
    const clipStart = lastEnd;
    const end = Math.max(clipEnd, clipStart + MIN_CLIP_SECONDS);
    segs.push({
      index: segs.length,
      text,
      start: text ? sungStart : clipStart,
      end: text ? Math.min(sungEnd, end) : end,
      clipStart,
      clipEnd: end,
      imageKey: null,
      prompt: null,
      direction: null,
      status: "pending",
    });
    lastEnd = end;
  };

  // Fill a no-lyrics span [lastEnd, until] with text-free clips, splitting it
  // into chunks so the scene changes instead of one clip looping for ages.
  const pushInstrumental = (until: number) => {
    while (until - lastEnd > 0.01) {
      let end = Math.min(until, lastEnd + INSTRUMENTAL_CHUNK_SECONDS);
      // Absorb a small remainder into this chunk rather than leaving a sliver.
      if (until - end < 1.5) end = until;
      const prev = lastEnd;
      push(end, "", 0, 0);
      if (lastEnd <= prev) break; // safety against a stuck loop
    }
  };

  if (first.start > GAP_SECONDS) pushInstrumental(first.start);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const next = lines[i + 1];
    const nextStart = next ? next.start : total;
    const gapAfter = nextStart - line.end;
    const lineClipEnd =
      gapAfter > GAP_SECONDS ? Math.min(nextStart, line.end + LINE_HOLD_SECONDS) : nextStart;
    push(lineClipEnd, line.text.trim(), line.start, line.end);
    if (gapAfter > GAP_SECONDS && nextStart > lastEnd) pushInstrumental(nextStart);
  }

  if (total - lastEnd > GAP_SECONDS) pushInstrumental(total);

  return segs;
}

/** Clamp segments to a preview window (used by the AI-video styles). */
export function capForPreview(segments: VideoSegment[], cap: number): VideoSegment[] {
  return segments
    .filter((s) => s.clipStart < cap)
    .map((s) => ({
      ...s,
      clipEnd: Math.min(s.clipEnd, cap),
      end: s.text ? Math.min(s.end, cap) : Math.min(s.clipEnd, cap),
    }))
    .filter((s) => s.clipEnd - s.clipStart >= MIN_CLIP_SECONDS / 2);
}

/** Build the timeline for a PREVIEW: a PREVIEW_SECONDS window starting at the
 *  first lyric line (skips the intro), with every time shifted so the preview
 *  starts at t=0. Returns the segments plus the song offset to seek the audio to
 *  (so the audio lines up with the first line). */
export function buildPreviewSegments(
  lyrics: Lyrics | null,
  durationSeconds: number | null,
): { segments: VideoSegment[]; audioStartSeconds: number } {
  if (!lyrics) return { segments: [], audioStartSeconds: 0 };
  const all = buildSegments(lyrics, durationSeconds);
  const firstLine = all.find((s) => s.text.trim().length > 0) ?? all[0];
  if (!firstLine) return { segments: [], audioStartSeconds: 0 };

  const start = firstLine.clipStart;
  const end = start + PREVIEW_SECONDS;
  const segments = all
    .filter((s) => s.clipStart < end && s.clipEnd > start)
    .map((s) => {
      const clipStart = Math.max(s.clipStart, start) - start;
      const clipEnd = Math.min(s.clipEnd, end) - start;
      const sungStart = Math.max(s.start, start) - start;
      const sungEnd = Math.min(s.end, end) - start;
      return {
        ...s,
        clipStart,
        clipEnd,
        start: s.text ? sungStart : clipStart,
        end: s.text ? Math.max(sungEnd, sungStart) : clipEnd,
      };
    })
    .filter((s) => s.clipEnd - s.clipStart >= MIN_CLIP_SECONDS / 2)
    .map((s, i) => ({ ...s, index: i }));

  return { segments, audioStartSeconds: start };
}

/** The generated (billable) length of one segment's motion clip, after the
 *  model's min/max clamp. Mirrors runAnimated/runCinematic in the pipeline. */
function clipGenSeconds(model: VideoModel, clipDuration: number): number {
  if (model === "pro") {
    return Math.min(CINEMATIC_MAX_SECONDS, Math.max(CINEMATIC_MIN_SECONDS, Math.ceil(clipDuration)));
  }
  // normal (Grok). fast has no clips, handled by the caller.
  return Math.min(GROK_MAX_SECONDS, Math.max(GROK_MIN_SECONDS, Math.ceil(clipDuration)));
}

// ===========================================================================
// Cost model — what a generation costs us at OpenRouter, and what we charge.
// ALL pricing lives here so a change is one place. Tune the constants against
// your OpenRouter usage dashboard.
// ===========================================================================

/** Markup over raw OpenRouter cost: we charge ~3× what generation costs us. */
export const VIDEO_COST_MARKUP = 3;

/** USD a single token is worth, anchored to the Pro plan ($29 / 60,000 tokens ≈
 *  $0.000483). Video token prices are computed off THIS one rate for every user
 *  regardless of their plan — a given video costs the same number of tokens for
 *  everyone. THE master pricing lever: charge = (cost × markup) ÷ USD_PER_TOKEN. */
export const USD_PER_TOKEN = 29 / 60_000; // ≈ $0.000483 (Pro: 60k tokens for $29)

/** Floor so a very short clip never rounds down to ~0 tokens. */
export const MIN_VIDEO_TOKENS = 20;

/** Raw OpenRouter cost per backdrop image (USD), by quality × resolution.
 *  fast/1K is MEASURED from billing ($0.0682); the others are scaled estimates
 *  — verify against the OpenRouter dashboard and adjust. */
export const IMAGE_COST_USD: Record<ImageQuality, Record<ImageSize, number>> = {
  fast: { "1K": 0.068, "2K": 0.102, "4K": 0.17 }, // Nano Banana 2 (Gemini 3.1 Flash Image)
  pro: { "1K": 0.136, "2K": 0.204, "4K": 0.34 }, //  Nano Banana Pro (Gemini 3 Pro Image), ~2× fast
};

/** Raw cost per generated SECOND of motion clip (USD/sec), by motion model.
 *  Slideshow (ffmpeg Ken-Burns) has no clip cost. Estimates — tune to billing. */
export const CLIP_COST_USD_PER_SEC: Record<VideoModel, number> = {
  fast: 0, //    ffmpeg — free
  normal: 0.05, // Grok Imagine @720p (Living Scenes)
  pro: 0.04, //   Seedance 2.0 Fast @480p (Cinematic)
};

/** Token cost to (re)generate a SINGLE backdrop image — the manual-mode
 *  Regenerate price. One image at the 3× markup, rounded up to the nearest 10. */
export function singleImageTokens(quality: ImageQuality, imageSize: ImageSize): number {
  const usd = IMAGE_COST_USD[quality][imageSize] * VIDEO_COST_MARKUP;
  return Math.max(10, Math.ceil(usd / USD_PER_TOKEN / 10) * 10);
}

/** Raw cost of one AI album cover (USD), by model. `flux` (fal.ai FLUX schnell)
 *  is the cheap default; `nano` (Nano Banana 2 on OpenRouter) is the premium
 *  option — same per-image cost as a "fast" 1K backdrop. */
export const COVER_IMAGE_COST_USD: Record<CoverModel, number> = {
  flux: 0.003,
  nano: IMAGE_COST_USD.fast["1K"], // 0.068
};

/** Token cost to generate one AI album cover for the chosen model — the cover
 *  model's cost at the 3× markup, rounded up to the nearest 10. flux → 20,
 *  nano → 430. */
export function coverImageTokens(model: CoverModel = "flux"): number {
  const usd = COVER_IMAGE_COST_USD[model] * VIDEO_COST_MARKUP;
  return Math.max(10, Math.ceil(usd / USD_PER_TOKEN / 10) * 10);
}

export type VideoCostEstimate = {
  /** Number of scenes (= images) in the rendered timeline. */
  segments: number;
  images: number;
  /** Total billable seconds of motion clips (0 for Slideshow). */
  clipSeconds: number;
  /** What the generation costs us at OpenRouter. */
  rawUsd: number;
  /** What we charge the user, in dollars (rawUsd × markup). */
  chargeUsd: number;
  /** Token price shown in the modal and charged on generate. */
  tokens: number;
};

/** Estimate a lyric-video job's cost from the song's lyrics + chosen settings.
 *  Pure + deterministic, so the modal can show the exact token price before the
 *  user clicks Generate and the route can charge the identical amount. */
export function estimateVideoCost(opts: {
  model: VideoModel;
  quality: ImageQuality;
  imageSize: ImageSize;
  lyrics: Lyrics | null;
  durationSeconds: number | null;
  /** Price a ~10s preview window instead of the full (capped) timeline. */
  preview?: boolean;
  /** Frames are reused from another already-rendered style, so the image term is
   *  free — only the motion-clip step is charged. */
  reuseImages?: boolean;
}): VideoCostEstimate {
  const { model, quality, imageSize } = opts;

  let segs: VideoSegment[];
  if (opts.preview) {
    segs = buildPreviewSegments(opts.lyrics, opts.durationSeconds).segments;
  } else {
    segs = opts.lyrics ? buildSegments(opts.lyrics, opts.durationSeconds) : [];
    // The AI-video styles render only a capped window when one is set.
    const cap = VIDEO_MODEL_INFO[model].previewSeconds;
    if (cap != null) segs = capForPreview(segs, cap);
  }

  // When reusing an existing style's frames, the (expensive) image step is skipped.
  const images = opts.reuseImages ? 0 : segs.length;
  const imageUsd = images * IMAGE_COST_USD[quality][imageSize];

  let clipSeconds = 0;
  if (model !== "fast") {
    for (const s of segs) clipSeconds += clipGenSeconds(model, s.clipEnd - s.clipStart);
  }
  const clipUsd = clipSeconds * CLIP_COST_USD_PER_SEC[model];

  const rawUsd = imageUsd + clipUsd;
  const chargeUsd = rawUsd * VIDEO_COST_MARKUP;
  // Round up to a tidy multiple of 100 tokens (only ever helps the margin).
  const tokens = Math.max(MIN_VIDEO_TOKENS, Math.ceil(chargeUsd / USD_PER_TOKEN / 100) * 100);

  return { segments: segs.length, images, clipSeconds, rawUsd, chargeUsd, tokens };
}
