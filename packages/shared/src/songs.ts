import { z } from "zod";
import { COVER_MODELS, GENERATION_MODES } from "./constants.js";
import { lyricsSchema } from "./lyrics.js";
import { sceneGroupingSchema, videoJobSchema, videoJobStatusSchema, videoModelSchema } from "./video.js";

/** A finished lyric video saved on a song, for one style. */
export const songVideoSchema = z.object({
  model: videoModelSchema,
  url: z.string().url(),
  /** True when this saved video is only a short preview, not the full song. */
  isPreview: z.boolean().default(false),
  /** How the source job grouped lyric lines into scenes — the reuse-frames
   *  quote re-prices that exact timeline, so it must know the planning mode. */
  sceneGrouping: sceneGroupingSchema.default("line"),
});
export type SongVideo = z.infer<typeof songVideoSchema>;

export const SONG_STATUSES = ["pending", "processing", "ready", "failed"] as const;
export const songStatusSchema = z.enum(SONG_STATUSES);
export type SongStatus = z.infer<typeof songStatusSchema>;

export const SONG_STAGES = ["separating", "transcribing"] as const;
export const songStageSchema = z.enum(SONG_STAGES);
export type SongStage = z.infer<typeof songStageSchema>;

export const generationModeSchema = z.enum(GENERATION_MODES);

export const processSongSchema = z.object({
  mode: generationModeSchema.optional(),
});
export type ProcessSongRequest = z.infer<typeof processSongSchema>;

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

/** Replace an existing song's cover image: presign a direct-to-R2 PUT, then
 *  commit the uploaded key. */
export const coverPresignSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});
export type CoverPresignRequest = z.infer<typeof coverPresignSchema>;

export const coverPresignResponseSchema = z.object({
  uploadUrl: z.string().url(),
  key: z.string(),
});
export type CoverPresignResponse = z.infer<typeof coverPresignResponseSchema>;

export const coverCommitSchema = z.object({
  key: z.string().min(1).max(300),
});
export type CoverCommitRequest = z.infer<typeof coverCommitSchema>;

export const coverModelSchema = z.enum(COVER_MODELS);

/** AI-generate a cover image from a free-text description. */
export const generateCoverSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  model: coverModelSchema.default("flux"),
});
export type GenerateCoverRequest = z.infer<typeof generateCoverSchema>;

/** Response from POST /songs/:id/cover/generate — an uncommitted preview the
 *  user can save (via the cover-commit route), regenerate, or discard. */
export const coverGenerateResponseSchema = z.object({
  key: z.string(),
  url: z.string().url(),
});
export type CoverGenerateResponse = z.infer<typeof coverGenerateResponseSchema>;

/** Auto-matched streaming links for a track (iTunes search → Odesli fan-out). */
export const linkMatchSchema = z.object({
  links: z.array(songLinkSchema),
  artworkUrl: z.string().url().nullable(),
  matchedTitle: z.string().nullable(),
  matchedArtist: z.string().nullable(),
});
export type LinkMatch = z.infer<typeof linkMatchSchema>;

/** Distinct artist/album values from the user's other songs, for autosuggest. */
export const metaSuggestionsSchema = z.object({
  artists: z.array(z.string()),
  albums: z.array(z.string()),
});
export type MetaSuggestions = z.infer<typeof metaSuggestionsSchema>;

// ---- Artist / album entities (organized Library) ---------------------------

export const artistSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  coverUrl: z.string().url().nullable(),
});
export type Artist = z.infer<typeof artistSchema>;
export const artistListSchema = z.array(artistSchema);

/** One expected track from a platform import (the user uploads audio per track). */
export const albumTrackSchema = z.object({
  title: z.string(),
  position: z.number().int().nullable(),
});
export type AlbumTrack = z.infer<typeof albumTrackSchema>;

export const albumSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  artistId: z.string().uuid(),
  coverUrl: z.string().url().nullable(),
  /** ISO date (YYYY-MM-DD) or null. */
  releaseDate: z.string().nullable(),
  /** Imported expected tracklist (empty for upload-built albums). */
  tracks: z.array(albumTrackSchema).default([]),
});
export type Album = z.infer<typeof albumSchema>;
export const albumListSchema = z.array(albumSchema);

/** Edit an artist entity. */
export const updateArtistSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
});
export type UpdateArtist = z.infer<typeof updateArtistSchema>;

/** Edit an album entity. */
export const updateAlbumSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  releaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullable()
    .optional(),
});
export type UpdateAlbum = z.infer<typeof updateAlbumSchema>;

/** Import an artist or album catalog from a streaming platform (Deezer). */
export const catalogImportSchema = z.object({
  /** A Deezer artist or album URL, or a bare "artist:<id>" / "album:<id>". */
  url: z.string().min(1).max(500),
});
export type CatalogImportRequest = z.infer<typeof catalogImportSchema>;

export const catalogImportResultSchema = z.object({
  artistId: z.string().uuid().nullable(),
  artistName: z.string().nullable(),
  albumsImported: z.number(),
  tracks: z.number(),
});
export type CatalogImportResult = z.infer<typeof catalogImportResultSchema>;

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
  /** When the pipeline actually started (status → processing). Null if not yet
   *  processed; we don't backfill legacy rows. Used by the progress overlay so
   *  elapsed time doesn't count the upload-form linger time. */
  processingStartedAt: z.string().nullable().default(null),
  /** Mode used to generate the lyrics. null for legacy rows pre-mode-feature. */
  mode: generationModeSchema.nullable().default(null),
  /** Finished lyric videos, one per generated style. Drives the edit-mode tabs. */
  videos: z.array(songVideoSchema).default([]),
  /** A lyric-video job still rendering for this song, if any — so the page can
   *  show its in-progress tab again after a reload/navigation. */
  activeVideoJob: videoJobSchema.nullable().default(null),
  /** Which video style is shown on the public page (null = none chosen). */
  publicVideoModel: videoModelSchema.nullable().default(null),
  /** True when the requesting user owns this song and may edit it. */
  canEdit: z.boolean().default(false),
});
export type Song = z.infer<typeof songSchema>;

export const songSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  artist: z.string().nullable().default(null),
  album: z.string().nullable().default(null),
  /** FK to the artist/album entities (null = untagged / anonymous). */
  artistId: z.string().uuid().nullable().default(null),
  albumId: z.string().uuid().nullable().default(null),
  status: songStatusSchema,
  /** Sub-stage while status === "processing". null otherwise. */
  stage: z.enum(["separating", "transcribing"]).nullable().default(null),
  durationSeconds: z.number().nullable(),
  coverUrl: z.string().url().nullable(),
  isPublic: z.boolean(),
  language: z.string().nullable(),
  lineCount: z.number(),
  createdAt: z.string(),
  processingStartedAt: z.string().nullable().default(null),
  mode: generationModeSchema.nullable().default(null),
  /** Lyric-video styles that have finished for this song. */
  videoModels: z.array(videoModelSchema).default([]),
  /** A lyric video still rendering (for the Music Videos card progress + Cancel). */
  videoActive: z
    .object({
      id: z.string().uuid(),
      status: videoJobStatusSchema,
      model: videoModelSchema,
      completedSegments: z.number(),
      totalSegments: z.number(),
    })
    .nullable()
    .default(null),
  /** Most recent video activity (finished or in-progress), for latest-first sort. */
  videoLatestAt: z.string().nullable().default(null),
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

/** Payload for the manual fine-tune timing editor: a full Lyrics object with
 *  per-word start/end timestamps the owner has hand-corrected. */
export const syncLyricsSchema = z.object({
  lyrics: lyricsSchema,
});
export type SyncLyrics = z.infer<typeof syncLyricsSchema>;

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

/** Choose which lyric-video style is public (or null to make none public). */
export const setPublicVideoSchema = z.object({
  model: videoModelSchema.nullable(),
});
export type SetPublicVideo = z.infer<typeof setPublicVideoSchema>;

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
  /** The lyric video the owner chose as public, if any. */
  lyricVideoUrl: z.string().url().nullable(),
  createdAt: z.string(),
  rating: ratingSummarySchema,
  /** The uploader account, or null for anonymous uploads. */
  uploader: uploaderSchema.nullable(),
  /** Other public, ready tracks uploaded by the same account. */
  moreFromUploader: z.array(publicTrackItemSchema),
});
export type PublicSong = z.infer<typeof publicSongSchema>;
