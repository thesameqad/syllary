import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  AudioFeatures,
  GenerationMode,
  ImageQuality,
  ImageSize,
  Lyrics,
  SongInsights,
  SongLink,
  VideoModel,
  VideoPipelineMode,
  VideoSegment,
} from "@syllary/shared";

// Keep in sync with SONG_STATUSES in @syllary/shared.
export const songStatus = pgEnum("song_status", ["pending", "processing", "ready", "failed"]);

export const songs = pgTable("songs", {
  id: uuid("id").defaultRandom().primaryKey(),
  status: songStatus("status").notNull().default("pending"),
  stage: text("stage").$type<"separating" | "transcribing">(),
  originalFilename: text("original_filename").notNull(),
  title: text("title"),
  artist: text("artist"),
  album: text("album"),
  year: integer("year"),
  genre: text("genre"),
  links: jsonb("links").$type<SongLink[]>(),
  r2Key: text("r2_key").notNull(),
  coverImageKey: text("cover_image_key"),
  contentType: text("content_type").notNull(),
  fileSize: integer("file_size").notNull(),
  durationSeconds: integer("duration_seconds"),
  language: text("language"),
  ownerHash: text("owner_hash").notNull(),
  userId: uuid("user_id"),
  isAnonymous: boolean("is_anonymous").notNull().default(true),
  isPublic: boolean("is_public").notNull().default(false),
  replicatePredictionId: text("replicate_prediction_id"),
  // Generation mode the row was processed with. Null for legacy rows.
  mode: text("mode").$type<GenerationMode>(),
  // Set when status transitions to "processing" (the moment the pipeline
  // actually starts). Distinct from createdAt, which is the upload-presign
  // time and can be much earlier if the user lingered on the upload form.
  processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
  lyrics: jsonb("lyrics").$type<Lyrics>(),
  insights: jsonb("insights").$type<SongInsights>(),
  audioFeatures: jsonb("audio_features").$type<AudioFeatures>(),
  // R2 key of the most recently generated lyric video (legacy; superseded by
  // the song_videos table, which holds one finished video per style).
  latestVideoKey: text("latest_video_key"),
  // Which lyric-video style is shown on the public page. Null = none chosen.
  publicVideoModel: text("public_video_model").$type<VideoModel>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SongRow = typeof songs.$inferSelect;

// Keep in sync with VIDEO_JOB_STATUSES in @syllary/shared.
export const videoJobStatus = pgEnum("video_job_status", [
  "pending",
  "processing",
  "review",
  "ready",
  "failed",
]);

// A lyric-video generation job. Long-running (per-line image gen + ffmpeg
// stitch), tracked here and advanced by an in-process pipeline; the client
// polls GET /api/video-jobs/:id.
export const videoJobs = pgTable(
  "video_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    status: videoJobStatus("status").notNull().default("pending"),
    // autopilot | manual
    mode: text("mode").$type<VideoPipelineMode>().notNull().default("autopilot"),
    // Render-engine tier: fast | normal | pro (only fast ships in v1).
    model: text("model").$type<VideoModel>().notNull().default("fast"),
    styleDescription: text("style_description").notNull(),
    aspectRatio: text("aspect_ratio").notNull().default("16:9"),
    // Backdrop resolution: 1K | 2K | 4K.
    imageSize: text("image_size").$type<ImageSize>().notNull().default("1K"),
    // Backdrop image-model tier: fast (Nano Banana 2) | pro (Nano Banana Pro).
    imageQuality: text("image_quality").$type<ImageQuality>().notNull().default("fast"),
    // ffmpeg (Ken-Burns) | ai (Wan/Kling, deferred). Swappable per the plan.
    motionMode: text("motion_mode").notNull().default("ffmpeg"),
    // True when this job renders only a short preview (not the full song).
    isPreview: boolean("is_preview").notNull().default(false),
    // One-time AI "art brief" (who/what the song depicts) injected into every
    // per-line image prompt so the model gets the subject/POV right.
    sceneBrief: text("scene_brief"),
    totalSegments: integer("total_segments").notNull().default(0),
    completedSegments: integer("completed_segments").notNull().default(0),
    segments: jsonb("segments").$type<VideoSegment[]>(),
    // R2 key of the finished MP4 (null until ready).
    videoKey: text("video_key"),
    error: text("error"),
    tokensCharged: integer("tokens_charged").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ songIdx: index("video_jobs_song_idx").on(t.songId) }),
);

export type VideoJobRow = typeof videoJobs.$inferSelect;

// One finished lyric video per song per style. Upserted when a job completes, so
// a song can hold several saved videos (one per style) and the owner picks which
// one is public (songs.publicVideoModel).
export const songVideos = pgTable(
  "song_videos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    model: text("model").$type<VideoModel>().notNull(),
    videoKey: text("video_key").notNull(),
    // True when the saved video for this style is only a preview sample.
    isPreview: boolean("is_preview").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniqueSongModel: unique("song_videos_song_model_unique").on(t.songId, t.model) }),
);

export type SongVideoRow = typeof songVideos.$inferSelect;

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email"),
  displayName: text("display_name"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  // free | starter | creator | pro
  plan: text("plan").notNull().default("free"),
  planStatus: text("plan_status"),
  credits: integer("credits").notNull().default(1000),
  // null for free tier (which uses a lifetime allowance instead)
  monthlyQuota: integer("monthly_quota"),
  songsThisPeriod: integer("songs_this_period").notNull().default(0),
  songsLifetime: integer("songs_lifetime").notNull().default(0),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;

// Star ratings on public songs — one per user per song (CLAUDE.md: public pages
// power SEO; signed-in visitors can rate, everyone sees the average).
export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stars: integer("stars").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniqueUserSong: unique("ratings_song_user_unique").on(t.songId, t.userId) }),
);

export type RatingRow = typeof ratings.$inferSelect;

// Stripe webhook idempotency (CLAUDE.md rule #1).
export const processedEvents = pgTable("processed_events", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Basic funnel analytics (no UI). One row per funnel event. An identity is the
// IP+UA owner hash (anonymous) and/or userId (signed in); the furthest stage
// reached per identity = where they dropped.
// stage: 'visited' | 'generated' | 'signed_up' | 'subscribed' | 'renewed'
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerHash: text("owner_hash").notNull(),
    userId: uuid("user_id"),
    stage: text("stage").notNull(),
    props: jsonb("props").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index("analytics_owner_idx").on(t.ownerHash),
    userIdx: index("analytics_user_idx").on(t.userId),
    stageIdx: index("analytics_stage_idx").on(t.stage),
  }),
);

export type AnalyticsEventRow = typeof analyticsEvents.$inferSelect;
