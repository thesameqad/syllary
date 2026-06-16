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
  /** Manual mode only: pre-generate every per-line image up front (true, default),
   *  or skip it (false) and let the user generate each scene on demand — no upfront
   *  image spend, full per-scene control. */
  prerenderImages: z.boolean().default(true),
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
});
export type ReviewSegment = z.infer<typeof reviewSegmentSchema>;

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
 *  motion prompt; omitting it re-rolls with whatever is already stored. */
export const regenerateClipSchema = z.object({
  motionDirection: z.string().max(2000).optional(),
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
