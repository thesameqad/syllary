import { z } from "zod";
import {
  IMAGE_QUALITIES,
  IMAGE_SIZES,
  MAX_VIDEO_CHARACTERS,
  VIDEO_MODELS,
  VIDEO_PIPELINE_MODES,
} from "./constants.js";

// Keep in sync with the video_job_status pgEnum in apps/api/src/db/schema.ts.
export const VIDEO_JOB_STATUSES = ["pending", "processing", "review", "ready", "failed"] as const;
export const videoJobStatusSchema = z.enum(VIDEO_JOB_STATUSES);
export type VideoJobStatus = z.infer<typeof videoJobStatusSchema>;

export const videoModelSchema = z.enum(VIDEO_MODELS);
export const videoPipelineModeSchema = z.enum(VIDEO_PIPELINE_MODES);
export const imageSizeSchema = z.enum(IMAGE_SIZES);
export const imageQualitySchema = z.enum(IMAGE_QUALITIES);

export const ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
export const aspectRatioSchema = z.enum(ASPECT_RATIOS);
export type AspectRatio = z.infer<typeof aspectRatioSchema>;

/** How lyric lines are grouped into scenes:
 *  - "time": consecutive lines share one scene until it spans ~10s (the default —
 *    ~30 scenes for a 5-min song instead of ~81, calmer pacing for dense lyrics).
 *  - "line": one scene per lyric line (the original behavior).
 *  - "block": semantic blocks — group by the lyrics' section labels
 *    (Verse/Chorus), splitting any section at 4 lines; plain 4-line chunks when
 *    the song has no section labels.
 *  - "single": "One scene" — the ENTIRE song is one scene: a single motion clip
 *    (at the model's max length) loops for the whole runtime while every lyric
 *    line appears at its sung moment as a typography plate. Living Scenes only
 *    (needs the plates loop machinery). */
export const SCENE_GROUPINGS = ["time", "line", "block", "single"] as const;
export const sceneGroupingSchema = z.enum(SCENE_GROUPINGS);
export type SceneGrouping = z.infer<typeof sceneGroupingSchema>;

/** How a scene's lyric text reaches the screen:
 *  - "baked": painted into the frame by the image model (the classic Syllary
 *    look — and the meaning of an ABSENT textMode on legacy segments).
 *  - "overlay": text-free frame + timed ffmpeg subtitle overlay per line
 *    (grouped Cinematic, and the safety fallback for failed plates).
 *  - "plates": one text-free base + one looping clip for the whole scene, with
 *    per-line inpainted text plates composited on the sung timing. */
export const TEXT_MODES = ["baked", "overlay", "plates"] as const;
export const textModeSchema = z.enum(TEXT_MODES);
export type TextMode = z.infer<typeof textModeSchema>;

/** One sung line inside a grouped scene. */
export const segmentLineSchema = z.object({
  text: z.string(),
  /** When this line is sung (seconds, absolute song time). */
  start: z.number(),
  end: z.number(),
  /** plates only: R2 key of this line's inpainted, alpha-feathered plate crop. */
  plateKey: z.string().nullable().default(null),
});
export type SegmentLine = z.infer<typeof segmentLineSchema>;

/** plates only: the text band chosen for a scene, normalized 0..1 to the canvas. */
export const plateRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type PlateRect = z.infer<typeof plateRectSchema>;

/** Request body for POST /api/songs/:id/video. */
export const createVideoSchema = z.object({
  styleDescription: z.string().trim().min(1).max(2000),
  /** The overall "what the video is about" direction (the song art brief),
   *  confirmed/overridden by the user before generating. Drives every scene. */
  sceneBrief: z.string().max(4000).optional(),
  mode: videoPipelineModeSchema.default("autopilot"),
  model: videoModelSchema.default("fast"),
  aspectRatio: aspectRatioSchema.default("16:9"),
  imageSize: imageSizeSchema.default("1K"),
  imageQuality: imageQualitySchema.default("fast"),
  /** A cheap ~10s sample from the first lyric line (always autopilot). */
  preview: z.boolean().default(false),
  /** Optional band-member ids to depict as the recurring characters — their
   *  photos are fed to the image model as references, restyled to the art
   *  direction. Resolved to reference image keys server-side. (Per-song "elements"
   *  are not selected here — they're mention-driven: @mention any of the song's
   *  elements in the brief or a scene and its reference is pulled in.) */
  characterIds: z.array(z.string().uuid()).max(MAX_VIDEO_CHARACTERS).optional(),
  /** Per-song element ids to include in this video (customized cast members +
   *  objects). Persisted on the job; the pipeline restricts the @mention-resolvable
   *  element catalog to this set. Omitted/empty → no elements (legacy null jobs fall
   *  back to the whole catalog). */
  elementIds: z.array(z.string().uuid()).optional(),
  /** Manual mode only: pre-generate every per-line image up front (true, default),
   *  or skip it (false) and let the user generate each scene on demand — no upfront
   *  image spend, full per-scene control. */
  prerenderImages: z.boolean().default(true),
  /** How lyric lines are grouped into scenes. See SCENE_GROUPINGS. */
  sceneGrouping: sceneGroupingSchema.default("time"),
});
export type CreateVideoRequest = z.infer<typeof createVideoSchema>;

/** One backdrop + text window in the rendered timeline. Persisted on the job so
 *  manual mode can later re-render individual lines. */
export const videoSegmentStatusSchema = z.enum(["pending", "image", "done", "failed"]);
export type VideoSegmentStatus = z.infer<typeof videoSegmentStatusSchema>;

/** Freshness of a segment's stored motion clip: none = not generated yet,
 *  ready = current, stale = the source image was re-rolled after the clip was made
 *  (so the re-render will refresh it to match). */
export const VIDEO_CLIP_STATUSES = ["none", "ready", "stale"] as const;
export const videoClipStatusSchema = z.enum(VIDEO_CLIP_STATUSES);
export type VideoClipStatus = z.infer<typeof videoClipStatusSchema>;

export const videoSegmentSchema = z.object({
  index: z.number().int(),
  text: z.string(),
  /** When this line is sung (text overlay window), in seconds. */
  start: z.number(),
  end: z.number(),
  /** When this line's backdrop is on screen (tiles the full timeline). */
  clipStart: z.number(),
  clipEnd: z.number(),
  imageKey: z.string().nullable().default(null),
  /** The exact prompt sent to the image model for this segment (kept for the
   *  record / debugging). Recomputed from style + context + direction on every
   *  (re)generate. Null until the frame is first generated. */
  prompt: z.string().nullable().default(null),
  /** Manual mode: the per-scene "direction" — what to depict in this frame
   *  (e.g. "girl walking away"). Defaults to the lyric line when null. The lyric
   *  itself is always what gets rendered as on-image typography. */
  direction: z.string().nullable().default(null),
  status: videoSegmentStatusSchema.default("pending"),
  /** Manual mode: the per-scene MOTION direction fed to the video model (Living
   *  Scenes / Cinematic), e.g. "slow push-in, leaves drifting". Null = the default
   *  per-model motion prompt. Ignored by Slideshow (no AI motion). */
  motionDirection: z.string().nullable().default(null),
  /** R2 key of this segment's stored motion clip (already fitted to its window),
   *  so the clip is reused on re-render and can be edited individually. Null until
   *  generated; never set for Slideshow. */
  clipKey: z.string().nullable().default(null),
  /** Freshness of clipKey. See VIDEO_CLIP_STATUSES. */
  clipStatus: videoClipStatusSchema.default("none"),
  /** Manual mode: depict NO recurring subjects in this scene — scenery / objects
   *  only. Overrides the default "@mention nobody → the whole band", for shots
   *  like "Suburban House" that shouldn't include any band member or element. */
  noCast: z.boolean().default(false),
  /** Per-line windows inside a grouped scene (grouping modes always set it, even
   *  for 1-line groups). ABSENT = legacy single-line scene; `text` then holds the
   *  one line. When present, `text` = lines joined with "\n". */
  lines: z.array(segmentLineSchema).optional(),
  /** How the lyric text reaches the screen for this scene. ABSENT = "baked"
   *  (exactly today's behavior for every existing job). */
  textMode: textModeSchema.optional(),
  /** plates only: the low-motion text band chosen for this scene. */
  plateRect: plateRectSchema.nullable().optional(),
  /** plates only: R2 key of the BARE loop clip (before plates are composited),
   *  kept so re-doing one plate never re-bills the motion clip. `clipKey` holds
   *  the composited result the assembly consumes. */
  loopClipKey: z.string().nullable().optional(),
  /** plates only: whether clipKey has the lyric plates composited in. FALSE =
   *  clipKey is the bare loop (user is iterating on motion; lyrics applied as a
   *  separate cheap step, or at finalize). ABSENT = true for legacy scenes. */
  platesApplied: z.boolean().optional(),
  /** plates only: the user-chosen length (seconds) of the GENERATED loopable
   *  clip before ping-pong tiling. Null/absent = the model's max. */
  loopSeconds: z.number().nullable().optional(),
});
export type VideoSegment = z.infer<typeof videoSegmentSchema>;

/** Client-facing per-line view for manual review: the lyric, the prompt used,
 *  and a presigned URL to the generated image. */
export const reviewSegmentSchema = z.object({
  index: z.number().int(),
  text: z.string(),
  prompt: z.string().nullable(),
  /** The per-scene direction (what to depict). Null = use the lyric line. */
  direction: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  status: videoSegmentStatusSchema,
  /** The per-scene motion direction (Living Scenes / Cinematic). Null = default. */
  motionDirection: z.string().nullable(),
  /** Presigned URL of the stored motion clip; null until generated. */
  clipUrl: z.string().url().nullable(),
  clipStatus: videoClipStatusSchema,
  /** Where this scene sits in the full song (seconds) — lets the motion editor
   *  sync the song audio to the clip during preview. */
  clipStart: z.number(),
  clipEnd: z.number(),
  /** This scene shows no recurring subjects (members/elements) — scenery only. */
  noCast: z.boolean().default(false),
  /** Per-line windows for grouped scenes (text + sung timing, no keys). Absent =
   *  single-line scene. */
  lines: z
    .array(z.object({ text: z.string(), start: z.number(), end: z.number() }))
    .optional(),
  /** How this scene's text reaches the screen. Defaults to "baked". */
  textMode: textModeSchema.default("baked"),
  /** plates only: how many of this scene's line-plates are generated (a count,
   *  not N presigned URLs — polls stay cheap). */
  platesReady: z.number().int().default(0),
  /** plates only: whether the current clip has the lyrics composited in. */
  platesApplied: z.boolean().default(true),
  /** plates only: user-chosen generated-loop length (null = model max). */
  loopSeconds: z.number().nullable().default(null),
});
export type ReviewSegment = z.infer<typeof reviewSegmentSchema>;

/** Body for POST /api/video-jobs/:id/groups — merge the consecutive scenes
 *  [from..to] (inclusive segment indexes) into ONE grouped scene. `textMode`
 *  picks how its lines reach the screen: "baked" (one stanza image — "show at
 *  once") or "plates" (one looping clip, lines appear in sequence). */
export const createSegmentGroupSchema = z.object({
  from: z.number().int().min(0),
  to: z.number().int().min(1),
  textMode: z.enum(["baked", "plates"]).default("baked"),
});
export type CreateSegmentGroupRequest = z.infer<typeof createSegmentGroupSchema>;

/** Body for PATCH /api/video-jobs/:id/groups/:index — flip a grouped scene
 *  between "show at once" (baked stanza) and "show in sequence" (plates).
 *  Resets the scene's generated assets (they encode the old mode). */
export const updateSegmentGroupSchema = z.object({
  textMode: z.enum(["baked", "plates"]),
});
export type UpdateSegmentGroupRequest = z.infer<typeof updateSegmentGroupSchema>;

/** Body for POST /api/video-jobs/:id/lines/move — move a BOUNDARY lyric line to
 *  the adjacent scene (lyric timing is fixed, so the first line can only move
 *  to the previous scene and the last line to the next). Both scenes' generated
 *  assets reset (their timelines changed). */
export const moveSegmentLineSchema = z.object({
  /** Scene the line currently lives in (segment index). */
  fromScene: z.number().int().min(0),
  /** The line's position within that scene's lines[]. */
  lineIndex: z.number().int().min(0),
  /** Adjacent target scene (fromScene ± 1). */
  toScene: z.number().int().min(0),
});
export type MoveSegmentLineRequest = z.infer<typeof moveSegmentLineSchema>;

/** Body for POST /api/video-jobs/:id/segments/:index/regenerate. The per-scene
 *  direction (what to depict). An empty string clears it back to the lyric
 *  line; omitting it re-rolls with whatever direction is already stored. */
export const regenerateSegmentSchema = z.object({
  direction: z.string().max(2000).optional(),
  /** Depict no recurring subjects in this scene (scenery only) — overrides the
   *  default of including the whole band when nobody is @mentioned. */
  noCast: z.boolean().optional(),
});
export type RegenerateSegmentRequest = z.infer<typeof regenerateSegmentSchema>;

/** Body for POST /api/video-jobs/:id/segments/:index/regenerate-clip — the
 *  per-scene MOTION direction. An empty string clears it back to the default
 *  motion prompt; omitting it re-rolls with whatever is already stored.
 *  For plates scenes this regenerates ONLY the bare loop (lyrics are applied
 *  as a separate step); `loopSeconds` picks the generated loopable length
 *  (clamped server-side to the motion model's range). */
export const regenerateClipSchema = z.object({
  motionDirection: z.string().max(2000).optional(),
  loopSeconds: z.number().int().min(1).max(30).optional(),
});
export type RegenerateClipRequest = z.infer<typeof regenerateClipSchema>;

/** Body for PATCH /api/video-jobs/:id/segments/:index — save a scene's motion
 *  direction WITHOUT regenerating (the re-render then refreshes that clip). */
export const updateSegmentSchema = z.object({
  motionDirection: z.string().max(2000).nullable().optional(),
});
export type UpdateSegmentRequest = z.infer<typeof updateSegmentSchema>;

/** Body for PATCH /api/video-jobs/:id — edit the job-wide shared fields that
 *  apply to every scene (manual mode). */
export const updateVideoJobSchema = z.object({
  styleDescription: z.string().trim().min(1).max(2000).optional(),
  sceneBrief: z.string().max(4000).nullable().optional(),
});
export type UpdateVideoJob = z.infer<typeof updateVideoJobSchema>;

/** Client-facing view of a video job (returned by create + poll). */
export const videoJobSchema = z.object({
  id: z.string().uuid(),
  songId: z.string().uuid(),
  status: videoJobStatusSchema,
  mode: videoPipelineModeSchema,
  model: videoModelSchema,
  styleDescription: z.string(),
  /** One-time AI "art brief" (who/what the song depicts), shared across every
   *  scene. Editable in manual mode. Null if not yet computed. */
  sceneBrief: z.string().nullable().default(null),
  aspectRatio: aspectRatioSchema,
  imageSize: imageSizeSchema,
  imageQuality: imageQualitySchema,
  /** How lyric lines were grouped into scenes for this job. */
  sceneGrouping: sceneGroupingSchema.default("line"),
  /** Manual mode: whether every scene image was pre-generated up front (paid at
   *  create) or is generated on demand (paid at finalize). Drives the editor's
   *  finalize-cost display. */
  prerenderImages: z.boolean().default(true),
  /** This job renders only a short preview (not the full song). */
  isPreview: z.boolean().default(false),
  /** This is a re-edit of an already-finished video (reopened into review to
   *  swap scenes + re-render), not a first-time manual job. Lets the review UI
   *  show the discard affordance + the re-render token cost. */
  isEdit: z.boolean().default(false),
  totalSegments: z.number(),
  completedSegments: z.number(),
  /** Per-line cards for manual review (empty until images are generated). */
  segments: z.array(reviewSegmentSchema).default([]),
  /** Names of the subjects (band members + elements) active for this video — lets
   *  the manual review UI offer @mentions. Empty when none were chosen. */
  characterNames: z.array(z.string()).default([]),
  /** Presigned playback URL for the finished MP4; null until ready. */
  videoUrl: z.string().url().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type VideoJob = z.infer<typeof videoJobSchema>;

/** Download resolutions offered in the download modal (target heights). */
export const VIDEO_DOWNLOAD_RESOLUTIONS = ["1080p", "720p", "480p"] as const;
export type VideoDownloadResolution = (typeof VIDEO_DOWNLOAD_RESOLUTIONS)[number];

/** Request a (resolution × watermark) download variant. `watermark:false` is
 *  gated to Music-video plans server-side. */
export const videoDownloadSchema = z.object({
  resolution: z.enum(VIDEO_DOWNLOAD_RESOLUTIONS).default("1080p"),
  watermark: z.boolean().default(true),
});
export type VideoDownloadRequest = z.infer<typeof videoDownloadSchema>;

/** Async download response: the variant is transcoded on demand + cached, so the
 *  client polls until `ready` and then fetches `url`. */
export const videoDownloadResponseSchema = z.object({
  status: z.enum(["processing", "ready"]),
  url: z.string().url().nullable().default(null),
});
export type VideoDownloadResponse = z.infer<typeof videoDownloadResponseSchema>;
