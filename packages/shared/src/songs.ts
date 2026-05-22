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
  title: z.string().min(1).max(200).optional(),
  artist: z.string().min(1).max(200).optional(),
  album: z.string().min(1).max(200).optional(),
  year: z.number().int().min(1).max(9999).optional(),
  coverContentType: z.string().min(1).optional(),
});
export type PresignRequest = z.infer<typeof presignRequestSchema>;

/** AI-generated song insights (summary, themes, mood) from Gemini at processing. */
/** A "listen on" streaming link. `platform` is a known key (spotify,
 *  apple_music, youtube, soundcloud, bandcamp, tidal) or a custom slug. */
export const songLinkSchema = z.object({
  platform: z.string().min(1).max(40),
  url: z.string().url().max(1000),
});
export type SongLink = z.infer<typeof songLinkSchema>;

export const songInsightsSchema = z.object({
  summary: z.string(),
  themes: z.array(z.string()),
  mood: z.string(),
});
export type SongInsights = z.infer<typeof songInsightsSchema>;

/** Audio features (BPM, key, etc). Populated later from an external source;
 *  every field is optional so the UI shows a chip only when data exists. */
export const audioFeaturesSchema = z.object({
  bpm: z.number().nullable().optional(),
  key: z.string().nullable().optional(),
  timeSignature: z.string().nullable().optional(),
  energy: z.number().nullable().optional(),
  danceability: z.number().nullable().optional(),
});
export type AudioFeatures = z.infer<typeof audioFeaturesSchema>;

export const presignResponseSchema = z.object({
  songId: z.string().uuid(),
  uploadUrl: z.string().url(),
  key: z.string(),
  coverUploadUrl: z.string().url().optional(),
});
export type PresignResponse = z.infer<typeof presignResponseSchema>;

export const songSchema = z.object({
  id: z.string().uuid(),
  status: songStatusSchema,
  stage: songStageSchema.nullable(),
  originalFilename: z.string(),
  title: z.string(),
  artist: z.string().nullable().default(null),
  album: z.string().nullable().default(null),
  year: z.number().nullable().default(null),
  genre: z.string().nullable().default(null),
  links: z.array(songLinkSchema).default([]),
  durationSeconds: z.number().nullable(),
  audioUrl: z.string().url().nullable(),
  coverUrl: z.string().url().nullable(),
  isPublic: z.boolean(),
  lyrics: lyricsSchema.nullable(),
  insights: songInsightsSchema.nullable().default(null),
  audioFeatures: audioFeaturesSchema.nullable().default(null),
  error: z.string().nullable(),
  createdAt: z.string(),
  /** True when the requesting user owns this song and may edit it. */
  canEdit: z.boolean().default(false),
});
export type Song = z.infer<typeof songSchema>;

export const songSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: songStatusSchema,
  durationSeconds: z.number().nullable(),
  coverUrl: z.string().url().nullable(),
  isPublic: z.boolean(),
  language: z.string().nullable(),
  lineCount: z.number(),
  createdAt: z.string(),
});
export type SongSummary = z.infer<typeof songSummarySchema>;

export const songListSchema = z.array(songSummarySchema);

export const updateSongSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  isPublic: z.boolean().optional(),
  artist: z.string().max(200).nullable().optional(),
  album: z.string().max(200).nullable().optional(),
  year: z.number().int().min(1).max(9999).nullable().optional(),
  genre: z.string().max(80).nullable().optional(),
  links: z.array(songLinkSchema).max(20).optional(),
});
export type UpdateSong = z.infer<typeof updateSongSchema>;

export const editLyricsSchema = z.object({
  text: z.string().max(50000),
});
export type EditLyrics = z.infer<typeof editLyricsSchema>;

export const ratingSummarySchema = z.object({
  averageRating: z.number(),
  ratingCount: z.number(),
  /** The signed-in user's own rating (1-5), or null if not signed in / not rated. */
  myRating: z.number().nullable(),
});
export type RatingSummary = z.infer<typeof ratingSummarySchema>;

export const rateSongSchema = z.object({
  stars: z.number().int().min(1).max(5),
});
export type RateSong = z.infer<typeof rateSongSchema>;

export const publicTrackItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  durationSeconds: z.number().nullable(),
  coverUrl: z.string().url().nullable(),
});
export type PublicTrackItem = z.infer<typeof publicTrackItemSchema>;

/** The account that uploaded a public song (shown on the public page). */
export const uploaderSchema = z.object({
  name: z.string(),
});
export type Uploader = z.infer<typeof uploaderSchema>;

export const publicSongSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  artist: z.string().nullable(),
  album: z.string().nullable(),
  year: z.number().nullable(),
  genre: z.string().nullable(),
  links: z.array(songLinkSchema),
  durationSeconds: z.number().nullable(),
  audioUrl: z.string().url(),
  coverUrl: z.string().url().nullable(),
  language: z.string().nullable(),
  lyrics: lyricsSchema.nullable(),
  insights: songInsightsSchema.nullable(),
  audioFeatures: audioFeaturesSchema.nullable(),
  createdAt: z.string(),
  rating: ratingSummarySchema,
  /** The uploader account, or null for anonymous uploads. */
  uploader: uploaderSchema.nullable(),
  /** Other public, ready tracks uploaded by the same account. */
  moreFromUploader: z.array(publicTrackItemSchema),
});
export type PublicSong = z.infer<typeof publicSongSchema>;
