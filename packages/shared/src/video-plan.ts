import type { CoverModel, ImageQuality, ImageSize, VideoModel } from "./constants.js";
import { PREVIEW_MAX_SCENES, PREVIEW_SECONDS, VIDEO_MODEL_INFO } from "./constants.js";
import type { Lyrics } from "./lyrics.js";
import type { SceneGrouping, VideoClipStatus, VideoSegment } from "./video.js";

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
// Seedance 1.5 Pro via fal (Living Scenes on the Lite tier): 4–12s clips only.
export const LITE_CLIP_MIN_SECONDS = 4;
export const LITE_CLIP_MAX_SECONDS = 12;
export const MIN_CLIP_SECONDS = 0.4;
// Instrumental stretches longer than this get their own text-free clip(s)
// rather than letting the previous line's frame linger.
export const GAP_SECONDS = 3;
// A long instrumental is split into chunks of at most this length, each its own
// scene, so the visuals keep changing instead of one clip looping for ages.
export const INSTRUMENTAL_CHUNK_SECONDS = 5;
// How long a line's frame holds after it's sung before an instrumental gap.
export const LINE_HOLD_SECONDS = 1.5;

// Scene grouping: how many lyric lines share one scene (image + clip).
export const GROUP_TIME_SECONDS = 10; // "time" mode: close a scene once it spans this
export const BLOCK_MAX_LINES = 4; //     "block" mode: hard cap per semantic block

/** Tile the song timeline into scenes according to the job's grouping mode.
 *  "line" reproduces the original per-line output byte-identically (reuse-frames
 *  determinism depends on this); "time"/"block" merge consecutive lines into
 *  grouped scenes carrying `lines[]`. Instrumental chunks are never grouped. */
export function buildSegments(
  lyrics: Lyrics,
  durationSeconds: number | null,
  grouping: SceneGrouping = "time",
): VideoSegment[] {
  const perLine = buildLineSegments(lyrics, durationSeconds);
  if (grouping === "line") return perLine;
  if (grouping === "single") {
    // "One scene": the whole song is ONE plates scene — a single loop clip
    // covering the full runtime (intro/outro included), every lyric line
    // delivered as a typography plate at its sung moment. Stamped "plates"
    // here (not in the pipeline) so cost estimates price the plates too.
    const textSegs = perLine.filter((s) => s.text);
    if (textSegs.length === 0) return perLine;
    const merged = mergeGroup(textSegs);
    return [
      {
        ...merged,
        index: 0,
        clipStart: 0,
        clipEnd: perLine[perLine.length - 1]!.clipEnd,
        textMode: "plates",
      },
    ];
  }
  // Section label per non-empty line, in the SAME order buildLineSegments walks
  // them (labels mark only the line that STARTS a section).
  const sections = lyrics.lines
    .filter((l) => l.text.trim().length > 0)
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((l) => l.section ?? null);
  return regroupSegments(perLine, grouping, sections);
}

/** Merge consecutive line-segments into grouped scenes. Instrumental segments
 *  pass through untouched and close any open group. */
function regroupSegments(
  perLine: VideoSegment[],
  grouping: "time" | "block",
  sections: (string | null)[],
): VideoSegment[] {
  const out: VideoSegment[] = [];
  let group: VideoSegment[] = [];

  const flush = () => {
    if (group.length === 0) return;
    out.push(mergeGroup(group));
    group = [];
  };

  let lineCursor = 0;
  for (const seg of perLine) {
    if (!seg.text) {
      flush();
      out.push({ ...seg });
      continue;
    }
    const label = sections[lineCursor] ?? null;
    lineCursor += 1;
    if (grouping === "block") {
      // A labeled line STARTS a new section → close the previous block (unless
      // this is the block's first line). Songs with no labels at all only ever
      // hit the 4-line cap → plain 4-line chunks.
      if (label != null && group.length > 0) flush();
      group.push(seg);
      if (group.length >= BLOCK_MAX_LINES) flush();
    } else {
      group.push(seg);
      const span = group[group.length - 1]!.clipEnd - group[0]!.clipStart;
      if (span >= GROUP_TIME_SECONDS) flush();
    }
  }
  flush();
  return out.map((s, i) => ({ ...s, index: i }));
}

/** Collapse a run of consecutive line-segments into ONE grouped scene. `text`
 *  joins the lines with "\n" (so every existing seg.text consumer still works);
 *  `lines[]` keeps per-line sung windows (plates/overlay timing + lossless
 *  ungroup). Grouped modes set `lines[]` even for 1-line groups so downstream
 *  handling is uniform. */
function mergeGroup(group: VideoSegment[]): VideoSegment {
  const first = group[0]!;
  const last = group[group.length - 1]!;
  return {
    ...first,
    text: group.map((s) => s.text).join("\n"),
    start: first.start,
    end: last.end,
    clipStart: first.clipStart,
    clipEnd: last.clipEnd,
    lines: group.map((s) => ({ text: s.text, start: s.start, end: s.end, plateKey: null })),
  };
}

/** Tile the song timeline into clips. Each lyric line gets a frame (with its
 *  text rendered in); a line's frame lingers through SHORT gaps to the next
 *  line, but a gap longer than GAP_SECONDS (intro, mid-song break, outro) gets
 *  its own text-free instrumental frame so the previous line doesn't hang on. */
function buildLineSegments(lyrics: Lyrics, durationSeconds: number | null): VideoSegment[] {
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
      motionDirection: null,
      clipKey: null,
      clipStatus: "none",
      noCast: false,
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

/** Clamp a grouped scene's per-line windows to [winStart, winEnd) (absolute
 *  times), dropping lines that fall outside and re-deriving `text` from the
 *  survivors. No-op for legacy single-line segments. */
function clampLines(seg: VideoSegment, winStart: number, winEnd: number): VideoSegment {
  if (!seg.lines) return seg;
  const lines = seg.lines
    .filter((l) => l.start < winEnd && l.end > winStart)
    .map((l) => ({ ...l, start: Math.max(l.start, winStart), end: Math.min(l.end, winEnd) }));
  return { ...seg, lines, text: lines.map((l) => l.text).join("\n") };
}

/** Clamp segments to a preview window (used by the AI-video styles). */
export function capForPreview(segments: VideoSegment[], cap: number): VideoSegment[] {
  return segments
    .filter((s) => s.clipStart < cap)
    .map((s) => ({
      ...clampLines(s, 0, cap),
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
  grouping: SceneGrouping = "time",
): { segments: VideoSegment[]; audioStartSeconds: number } {
  if (!lyrics) return { segments: [], audioStartSeconds: 0 };
  const all = buildSegments(lyrics, durationSeconds, grouping);
  const firstLine = all.find((s) => s.text.trim().length > 0) ?? all[0];
  if (!firstLine) return { segments: [], audioStartSeconds: 0 };

  // "single" collapses the whole song into one scene whose clipStart is 0 —
  // anchoring there would preview the (lyric-free) intro. Anchor at the first
  // sung line instead; other modes keep the scene's own start (byte-identical).
  const start =
    grouping === "single"
      ? Math.max(0, (firstLine.lines?.[0]?.start ?? firstLine.start) - 1)
      : firstLine.clipStart;
  const end = start + PREVIEW_SECONDS;
  const segments = all
    .filter((s) => s.clipStart < end && s.clipEnd > start)
    .map((s) => {
      const clipStart = Math.max(s.clipStart, start) - start;
      const clipEnd = Math.min(s.clipEnd, end) - start;
      const sungStart = Math.max(s.start, start) - start;
      const sungEnd = Math.min(s.end, end) - start;
      const clamped = clampLines(s, start, end);
      return {
        ...clamped,
        // Shift per-line windows into preview time (t=0 at the first line).
        lines: clamped.lines?.map((l) => ({ ...l, start: l.start - start, end: l.end - start })),
        clipStart,
        clipEnd,
        start: clamped.text ? sungStart : clipStart,
        end: clamped.text ? Math.max(sungEnd, sungStart) : clipEnd,
      };
    })
    .filter((s) => s.clipEnd - s.clipStart >= MIN_CLIP_SECONDS / 2)
    // Cap the preview to a fixed number of scenes so generation cost is bounded.
    .slice(0, PREVIEW_MAX_SCENES)
    .map((s, i) => ({ ...s, index: i }));

  return { segments, audioStartSeconds: start };
}

/** The generated (billable) length of one segment's motion clip, after the
 *  model's min/max clamp. Mirrors runAnimated/runCinematic in the pipeline. */
function clipGenSeconds(model: VideoModel, clipDuration: number, quality: ImageQuality = "fast"): number {
  if (model === "pro") {
    return Math.min(CINEMATIC_MAX_SECONDS, Math.max(CINEMATIC_MIN_SECONDS, Math.ceil(clipDuration)));
  }
  // normal on Lite = Seedance 1.5 (4–12s); normal otherwise = Grok (1–15s).
  // fast has no clips, handled by the caller.
  if (quality === "lite") {
    return Math.min(LITE_CLIP_MAX_SECONDS, Math.max(LITE_CLIP_MIN_SECONDS, Math.ceil(clipDuration)));
  }
  return Math.min(GROK_MAX_SECONDS, Math.max(GROK_MIN_SECONDS, Math.ceil(clipDuration)));
}

// ===========================================================================
// Cost model — what a generation costs us at OpenRouter, and what we charge.
// ALL pricing lives here so a change is one place. Tune the constants against
// your OpenRouter usage dashboard.
// ===========================================================================

/** Markup over raw OpenRouter cost: we charge ~3× what generation costs us.
 *  The Lite tier runs at a friendlier 2× so a reel-plan month (80k tokens)
 *  covers 5+ Lite videos — see markupFor(). */
export const VIDEO_COST_MARKUP = 3;
export const LITE_COST_MARKUP = 2;

export function markupFor(quality: ImageQuality): number {
  return quality === "lite" ? LITE_COST_MARKUP : VIDEO_COST_MARKUP;
}

/** USD a single token is worth, anchored to the Pro plan ($29 / 60,000 tokens ≈
 *  $0.000483). Video token prices are computed off THIS one rate for every user
 *  regardless of their plan — a given video costs the same number of tokens for
 *  everyone. THE master pricing lever: charge = (cost × markup) ÷ USD_PER_TOKEN. */
export const USD_PER_TOKEN = 29 / 60_000; // ≈ $0.000483 (Pro: 60k tokens for $29)

/** Floor so a very short clip never rounds down to ~0 tokens. */
export const MIN_VIDEO_TOKENS = 20;

/** Flat token price for a PREVIEW render, by model — a fixed "try before you buy"
 *  so a free user gets a predictable number of tries (300/400/700 → 3/2/1 on the
 *  1,000-credit free grant). The preview's work is also bounded (PREVIEW_MAX_SCENES
 *  + forced fast/1K in estimateVideoCost), so our COGS stays well under these prices.
 *  Full renders are NOT affected — they price from real per-song cost below. */
export const PREVIEW_TOKENS: Record<VideoModel, number> = {
  fast: 300,
  normal: 400,
  pro: 700,
};

/** Raw OpenRouter cost per backdrop image (USD), by quality × resolution.
 *  fast/1K is MEASURED from billing ($0.0682); the others are scaled estimates
 *  — verify against the OpenRouter dashboard and adjust. */
export const IMAGE_COST_USD: Record<ImageQuality, Record<ImageSize, number>> = {
  // Qwen-Image on fal: $0.02/megapixel (generated at ≤1MP — fal rounds UP per
  // MP, so 1280×720 bills exactly $0.02) + ~$0.007 avg for the vision-QC retry
  // loop (typos get one regenerate). Lite is 1K-only; the 2K/4K rows exist so
  // the type stays total, but estimateVideoCost clamps lite to 1K.
  lite: { "1K": 0.027, "2K": 0.027, "4K": 0.027 },
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

/** Lite-tier override: Living Scenes on Lite animates with Seedance 1.5 Pro
 *  @480p silent via fal — (864×480×24fps)/1024 tokens/s at $1.2/M = $0.0117/s.
 *  Cinematic has no Lite tier, and Slideshow's clips are free everywhere. */
export const LITE_CLIP_COST_USD_PER_SEC = 0.0117;

export function clipCostPerSec(model: VideoModel, quality: ImageQuality = "fast"): number {
  if (quality === "lite" && model === "normal") return LITE_CLIP_COST_USD_PER_SEC;
  return CLIP_COST_USD_PER_SEC[model];
}

/** Raw INPUT cost per character reference image fed to the model, by image-model
 *  tier (USD). A reference ≈ 560 input tokens; Nano Banana Pro input @ $2/M ≈
 *  $0.0011. Estimates — tune against the OpenRouter dashboard. Folded into rawUsd
 *  (then ×3 markup) so character videos are still priced on the standard formula. */
export const REF_IMAGE_INPUT_USD: Record<ImageQuality, number> = {
  lite: 0, // Lite has no cast members (Qwen-Image takes no reference photos)
  fast: 0.0003,
  pro: 0.0011,
};

/** Token cost to (re)generate a SINGLE backdrop image — the manual-mode
 *  Regenerate price. One image at the 3× markup, rounded up to the nearest 10. */
export function singleImageTokens(quality: ImageQuality, imageSize: ImageSize): number {
  const usd = IMAGE_COST_USD[quality][imageSize] * markupFor(quality);
  return Math.max(10, Math.ceil(usd / USD_PER_TOKEN / 10) * 10);
}

/** Token cost to (re)generate a SINGLE motion clip — the motion-editor Regenerate
 *  price. One clip's billable seconds (after the model's min/max clamp) at the 3×
 *  markup, rounded up to the nearest 10. Zero for Slideshow (no AI motion). */
export function singleClipTokens(
  model: VideoModel,
  clipDurationSeconds: number,
  quality: ImageQuality = "fast",
): number {
  if (model === "fast") return 0;
  const usd =
    clipGenSeconds(model, clipDurationSeconds, quality) *
    clipCostPerSec(model, quality) *
    markupFor(quality);
  return Math.max(10, Math.ceil(usd / USD_PER_TOKEN / 10) * 10);
}

/** Raw cost of ONE inpainted lyric plate (Feature B: qwen-image-edit/inpaint at
 *  the base image's ≤1MP size, + vision-QC + one retry allowance). PLACEHOLDER —
 *  verified against fal's pricing page in the plates discovery step. */
export const PLATE_COST_USD = 0.04;

/** Token price of one inpainted lyric plate (the per-line unit of a shared-clip
 *  group). Standard 3× markup — plates aren't a Lite-only feature. */
export function singlePlateTokens(): number {
  const usd = PLATE_COST_USD * VIDEO_COST_MARKUP;
  return Math.max(10, Math.ceil(usd / USD_PER_TOKEN / 10) * 10);
}

/** Token cost to re-render an edited video, REUSING the clips already generated.
 *  Slideshow is just a cheap re-stitch (MIN_VIDEO_TOKENS). For the AI-motion styles
 *  it's the sum over clips that still need (re)generating — stale (their image
 *  changed) or never generated — so re-rendering with everything fresh is free.
 *  The finalize route and the client re-render button both call this, so the shown
 *  price always equals the charge. */
export function reRenderTokens(
  model: VideoModel,
  segments: { clipStatus: VideoClipStatus; clipStart: number; clipEnd: number }[],
  quality: ImageQuality = "fast",
): number {
  if (model === "fast") return MIN_VIDEO_TOKENS;
  return segments
    .filter((s) => s.clipStatus !== "ready")
    .reduce((n, s) => n + singleClipTokens(model, s.clipEnd - s.clipStart, quality), 0);
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
  /** Inpainted lyric plates across shared-clip scenes (0 unless plates groups exist). */
  plates: number;
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
  /** Character reference images sent to the model PER FRAME (their input cost is
   *  added to rawUsd before the markup). 0/undefined when no characters chosen. */
  referenceImages?: number;
  /** How lyric lines are grouped into scenes (ignored when `segments` is given). */
  sceneGrouping?: SceneGrouping;
  /** Price THIS exact timeline instead of re-planning from lyrics — used by the
   *  reuse/promote/finalize paths so the quote always matches the persisted job
   *  (including shared-clip plates groups, which planning never creates). */
  segments?: VideoSegment[];
}): VideoCostEstimate {
  const { model } = opts;
  // Previews are forced to the cheapest fast/1K image quality (and capped scenes in
  // buildPreviewSegments) so the flat preview price always beats our COGS — the
  // free-tier preview funnel is identical across quality tiers. Full renders use
  // the user's chosen quality; Lite additionally pins 1K (Qwen bills per rounded-up
  // megapixel, so ≤1MP is the only size that hits its $0.02 price).
  const quality: ImageQuality = opts.preview ? "fast" : opts.quality;
  const imageSize: ImageSize = opts.preview || opts.quality === "lite" ? "1K" : opts.imageSize;

  const grouping = opts.sceneGrouping ?? "time";
  let segs: VideoSegment[];
  if (opts.segments) {
    segs = opts.segments;
  } else if (opts.preview) {
    segs = buildPreviewSegments(opts.lyrics, opts.durationSeconds, grouping).segments;
  } else {
    segs = opts.lyrics ? buildSegments(opts.lyrics, opts.durationSeconds, grouping) : [];
    // The AI-video styles render only a capped window when one is set.
    const cap = VIDEO_MODEL_INFO[model].previewSeconds;
    if (cap != null) segs = capForPreview(segs, cap);
  }

  // When reusing an existing style's frames, the (expensive) image step is skipped.
  const images = opts.reuseImages ? 0 : segs.length;
  const imageUsd = images * IMAGE_COST_USD[quality][imageSize];

  let clipSeconds = 0;
  if (model !== "fast") {
    // A plates scene bills ONE loop clip; clipGenSeconds' max-clamp already caps
    // a long span at the model's max generatable length, so no special branch.
    for (const s of segs) clipSeconds += clipGenSeconds(model, s.clipEnd - s.clipStart, quality);
  }
  const clipUsd = clipSeconds * clipCostPerSec(model, quality);

  // Shared-clip scenes deliver each line as an inpainted plate.
  let plates = 0;
  for (const s of segs) {
    if (s.textMode === "plates") plates += s.lines?.length ?? 0;
  }
  const platesUsd = plates * PLATE_COST_USD;

  // Character reference images are input on every generated frame. When reusing
  // frames the model isn't called, so there's no reference cost either.
  const refsPerFrame = opts.reuseImages ? 0 : (opts.referenceImages ?? 0);
  const refUsd = images * refsPerFrame * REF_IMAGE_INPUT_USD[quality];

  const rawUsd = imageUsd + clipUsd + platesUsd + refUsd;
  const chargeUsd = rawUsd * markupFor(quality);
  // Previews are a flat price by model; full renders round up to a tidy multiple of
  // 100 tokens (only ever helps the margin).
  const tokens = opts.preview
    ? PREVIEW_TOKENS[model]
    : Math.max(MIN_VIDEO_TOKENS, Math.ceil(chargeUsd / USD_PER_TOKEN / 100) * 100);

  return { segments: segs.length, images, clipSeconds, plates, rawUsd, chargeUsd, tokens };
}
