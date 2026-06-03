import { z } from "zod";
import { IMAGE_QUALITIES, IMAGE_SIZES, VIDEO_MODELS, VIDEO_PIPELINE_MODES } from "./constants.js";

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
  mode: videoPipelineModeSchema.default("autopilot"),
  model: videoModelSchema.default("fast"),
  aspectRatio: aspectRatioSchema.default("16:9"),
  imageSize: imageSizeSchema.default("1K"),
  imageQuality: imageQualitySchema.default("fast"),
  /** A cheap ~10s sample from the first lyric line (always autopilot). */
  preview: z.boolean().default(false),
});
export type CreateVideoRequest = z.infer<typeof createVideoSchema>;

/** One backdrop + text window in the rendered timeline. Persisted on the job so
 *  manual mode can later re-render individual lines. */
export const videoSegmentStatusSchema = z.enum(["pending", "image", "done", "failed"]);
export type VideoSegmentStatus = z.infer<typeof videoSegmentStatusSchema>;

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
});
export type ReviewSegment = z.infer<typeof reviewSegmentSchema>;

/** Body for POST /api/video-jobs/:id/segments/:index/regenerate. The per-scene
 *  direction (what to depict). An empty string clears it back to the lyric
 *  line; omitting it re-rolls with whatever direction is already stored. */
export const regenerateSegmentSchema = z.object({
  direction: z.string().max(2000).optional(),
});
export type RegenerateSegmentRequest = z.infer<typeof regenerateSegmentSchema>;

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
  totalSegments: z.number(),
  completedSegments: z.number(),
  /** Per-line cards for manual review (empty until images are generated). */
  segments: z.array(reviewSegmentSchema).default([]),
  /** Presigned playback URL for the finished MP4; null until ready. */
  videoUrl: z.string().url().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type VideoJob = z.infer<typeof videoJobSchema>;
