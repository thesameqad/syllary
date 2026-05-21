import { z } from "zod";
import { lyricsSchema } from "./lyrics.js";

export const SONG_STATUSES = ["pending", "processing", "ready", "failed"] as const;
export const songStatusSchema = z.enum(SONG_STATUSES);
export type SongStatus = z.infer<typeof songStatusSchema>;

export const SONG_STAGES = ["separating", "transcribing"] as const;
export const songStageSchema = z.enum(SONG_STAGES);
export type SongStage = z.infer<typeof songStageSchema>;

export const presignRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
  durationSeconds: z.number().positive().nullable().optional(),
});
export type PresignRequest = z.infer<typeof presignRequestSchema>;

export const presignResponseSchema = z.object({
  songId: z.string().uuid(),
  uploadUrl: z.string().url(),
  key: z.string(),
});
export type PresignResponse = z.infer<typeof presignResponseSchema>;

export const songSchema = z.object({
  id: z.string().uuid(),
  status: songStatusSchema,
  stage: songStageSchema.nullable(),
  originalFilename: z.string(),
  durationSeconds: z.number().nullable(),
  audioUrl: z.string().url().nullable(),
  lyrics: lyricsSchema.nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type Song = z.infer<typeof songSchema>;
