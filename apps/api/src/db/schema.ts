import {
  boolean,
  date,
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
  AlbumTrack,
  AudioFeatures,
  CharacterReference,
  FaqItem,
  GenerationMode,
  ImageQuality,
  ImageSize,
  LandingBlock,
  Lyrics,
  SceneGrouping,
  SongInsights,
  SongLink,
  StoredMemberImage,
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
  // Denormalized cache of the artist/album names (kept in sync with the entity
  // tables). Display/public/anonymous paths read these directly; the FKs below
  // power the organized Library, entity covers, and album release dates.
  artist: text("artist"),
  album: text("album"),
  artistId: uuid("artist_id").references(() => artists.id, { onDelete: "set null" }),
  albumId: uuid("album_id").references(() => albums.id, { onDelete: "set null" }),
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
  // Video-card thumbnails: true (default) = the song's cover image; false = a
  // frame captured from the video itself (song_videos.thumb_key).
  useCoverForVideoThumb: boolean("use_cover_for_video_thumb").notNull().default(true),
  // First-touch SEO landing page this song's owner arrived from (slug, no
  // leading slash). Stamped at generation from the earliest "visited" event for
  // this owner's hash; powers per-landing funnel attribution.
  acquisitionLandingSlug: text("acquisition_landing_slug"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  acquisitionIdx: index("songs_acquisition_idx").on(t.acquisitionLandingSlug),
}));

export type SongRow = typeof songs.$inferSelect;

// Real artist/album entities (per user) so the Library can organize a catalog
// and each can own a cover image (and an album its release date). Songs link to
// these via songs.artistId/albumId; the denormalized songs.artist/album strings
// are kept in sync as a cache. Created on demand from upload/edit metadata and
// from platform imports (Deezer). Anonymous songs have no entities (strings only).
export const artists = pgTable(
  "artists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    coverImageKey: text("cover_image_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniqueUserName: unique("artists_user_name_unique").on(t.userId, t.name) }),
);

export type ArtistRow = typeof artists.$inferSelect;

export const albums = pgTable(
  "albums",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    coverImageKey: text("cover_image_key"),
    // ISO date (YYYY-MM-DD); null until known.
    releaseDate: date("release_date"),
    // Expected tracklist from a platform import (Deezer) — the user uploads their
    // own audio per track. Empty for albums built only from uploaded songs.
    tracks: jsonb("tracks").$type<AlbumTrack[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueUserArtistName: unique("albums_user_artist_name_unique").on(t.userId, t.artistId, t.name),
  }),
);

export type AlbumRow = typeof albums.$inferSelect;

// Reusable band members ("characters") that belong to an artist (band). Each
// carries one or more uploaded reference photos (R2 keys). Optionally selected
// at video time so the AI scenes depict them, restyled to the art direction.
export const bandMembers = pgTable(
  "band_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Uploaded reference photos as R2 keys (jsonb array; mirrors albums.tracks).
    images: jsonb("images").$type<StoredMemberImage[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueUserArtistName: unique("band_members_user_artist_name_unique").on(
      t.userId,
      t.artistId,
      t.name,
    ),
    userIdx: index("band_members_user_idx").on(t.userId),
    artistIdx: index("band_members_artist_idx").on(t.artistId),
  }),
);

export type BandMemberRow = typeof bandMembers.$inferSelect;

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
    // True when seeded with another style's already-generated frames (imageKeys):
    // the pipeline skips the segment rebuild + image generation and only renders
    // motion. Always an autopilot full render.
    reuseFrames: boolean("reuse_frames").notNull().default(false),
    // Resolved band-member characters for this video — one entry per distinct
    // member with their name + reference image R2 keys. Snapshotted at job
    // creation, fed to the image model on every frame (name-labeled so the prompt
    // can reference "Emily"/"Justin"). Null = no characters. (Legacy jobs stored a
    // bare string[][] here; normalizeCharacterRefs() reads both shapes.)
    characterImageKeys: jsonb("character_image_keys").$type<CharacterReference[]>(),
    // Per-song element ids included in this video (selected on the Cast step).
    // The pipeline restricts the @mention-resolvable element catalog to this set.
    // Null = legacy job → fall back to the whole song catalog.
    elementIds: jsonb("element_ids").$type<string[]>(),
    // Manual mode: pre-generate every per-line image up front (true), or skip it and
    // let the user generate each scene on demand (false). Ignored by autopilot.
    prerenderImages: boolean("prerender_images").notNull().default(true),
    // How lyric lines are grouped into scenes: time | line | block. DB default
    // 'line' so every pre-existing row reads as exact-legacy; new inserts write
    // the request value (whose zod default is "time").
    sceneGrouping: text("scene_grouping").$type<SceneGrouping>().notNull().default("line"),
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
    // R2 key of a JPEG frame captured from the video (~5s in) — the video-card
    // thumbnail when songs.use_cover_for_video_thumb is off. Null until captured
    // (finalize captures new renders; a toggle-off backfills older ones).
    thumbKey: text("thumb_key"),
    // True when the saved video for this style is only a preview sample.
    isPreview: boolean("is_preview").notNull().default(false),
    // The grouping the source job used — the reuse-frames flow quotes its price
    // from the SOURCE timeline, so it must know how that timeline was planned.
    sceneGrouping: text("scene_grouping").$type<SceneGrouping>().notNull().default("line"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniqueSongModel: unique("song_videos_song_model_unique").on(t.songId, t.model) }),
);

export type SongVideoRow = typeof songVideos.$inferSelect;

// Hand-curated showcase categories for the dashboard ("abstract", "realistic",
// "living scenes", …). Admin-managed; each tag renders as a horizontal row of
// its picked public videos.
export const showcaseTags = pgTable("showcase_tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ShowcaseTagRow = typeof showcaseTags.$inferSelect;

// A hand-picked public video in a showcase tag. Points at the SONG — the row
// renders whatever video style the owner has made public (songs.publicVideoModel),
// so an owner republishing a different style keeps the pick fresh.
export const showcaseItems = pgTable(
  "showcase_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => showcaseTags.id, { onDelete: "cascade" }),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniqueTagSong: unique("showcase_items_tag_song_unique").on(t.tagId, t.songId) }),
);

export type ShowcaseItemRow = typeof showcaseItems.$inferSelect;

// Per-song "persisted elements" — reusable AI-generated reference subjects (a dog,
// headphones, a guitar) addressable like band members in prompts, but scoped to ONE
// song (not shared across songs/bands). The generated image is fed to the image model
// as a named reference; the name is @mentionable in the brief + per-scene directions.
export const songElements = pgTable(
  "song_elements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // The last description used to generate the image (prefilled when re-editing).
    description: text("description"),
    // R2 key of the generated reference image; null until generated + saved.
    imageKey: text("image_key"),
    // When set, this element is a "customized cast member": its image is generated
    // from this band member's photos + an outfit/hair prompt (face locked). Null for
    // plain object elements. SET NULL if the source member is deleted.
    sourceMemberId: uuid("source_member_id").references(() => bandMembers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueSongName: unique("song_elements_song_name_unique").on(t.songId, t.name),
    songIdx: index("song_elements_song_idx").on(t.songId),
  }),
);

export type SongElementRow = typeof songElements.$inferSelect;

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
  // When the one-time first-subscription token bonus (FIRST_SUB_BONUS) was
  // granted. Permanent once-per-user marker — stripe_subscription_id is nulled
  // on cancel, so cancel→resubscribe would otherwise re-farm the bonus.
  firstSubBonusAt: timestamp("first_sub_bonus_at", { withTimezone: true }),
  // First-touch SEO landing page this account arrived from (slug, no leading
  // slash). Stamped once on the first authed visit; powers per-landing
  // registration + upgrade attribution.
  acquisitionLandingSlug: text("acquisition_landing_slug"),
  acquisitionAt: timestamp("acquisition_at", { withTimezone: true }),
  // First-touch paid-ads click id (gclid/msclkid) + which network it came from
  // ('google' | 'microsoft'), bridged from anonymous visits the same way as the
  // landing slug. Lets the Stripe webhook report purchases back to the ad
  // platform (offline conversion import) so bidding can optimize on real money.
  acquisitionClickId: text("acquisition_click_id"),
  acquisitionClickSource: text("acquisition_click_source"),
  // First-touch UTM set (source/medium/campaign/term/content), when present.
  acquisitionUtm: jsonb("acquisition_utm").$type<Record<string, string>>(),
  // Opted out of non-transactional email (drip/nudges). Set via the
  // unsubscribe link; transactional sends (song-ready, receipts) are exempt.
  emailOptOut: boolean("email_opt_out").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  acquisitionIdx: index("users_acquisition_idx").on(t.acquisitionLandingSlug),
}));

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

// Paid-ads offline conversions awaiting upload to Google/Microsoft Ads. One row
// per purchase by a click-attributed user; the admin export endpoint serves
// these as the platforms' "conversions from clicks" CSV and stamps exportedAt.
export const conversionExports = pgTable(
  "conversion_exports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 'google' | 'microsoft' — decides which CSV template the row belongs to.
    source: text("source").notNull(),
    clickId: text("click_id").notNull(),
    conversionName: text("conversion_name").notNull().default("purchase"),
    conversionAt: timestamp("conversion_at", { withTimezone: true }).notNull(),
    valueCents: integer("value_cents").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    exportedAt: timestamp("exported_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pendingIdx: index("conversion_exports_pending_idx").on(t.exportedAt),
    sourceIdx: index("conversion_exports_source_idx").on(t.source),
  }),
);

export type ConversionExportRow = typeof conversionExports.$inferSelect;

// One row per lifecycle email actually sent — the unique (userId, kind) pair is
// what makes every drip/nudge/transactional send idempotent (pollers and event
// hooks can both fire without double-sending). `kind` examples: welcome,
// song_ready:<songId>, token_low, drip_video_day2, drip_upgrade_day5.
export const emailLog = pgTable(
  "email_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueUserKind: unique("email_log_user_kind_unique").on(t.userId, t.kind),
    userIdx: index("email_log_user_idx").on(t.userId),
  }),
);

export type EmailLogRow = typeof emailLog.$inferSelect;

// Keep in sync with the landing schemas in @syllary/shared.
export const landingCategory = pgEnum("landing_category", [
  "convert",
  "tools",
  "compare",
  "guides",
]);
export const landingRenderType = pgEnum("landing_render_type", ["content", "tool"]);
export const landingStatus = pgEnum("landing_status", ["draft", "published"]);

// Programmatic SEO landing pages. One row per page; rendered by a single dynamic
// template (apps/web) and made crawlable by the SEO worker, which injects
// `rendered_html` + meta into the static shell. `slug` is the full path after
// the domain (no leading slash), e.g. "convert/lrc-to-ttml".
export const landingPages = pgTable(
  "landing_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    category: landingCategory("category").notNull(),
    renderType: landingRenderType("render_type").notNull().default("content"),
    // Registry key of the mini-tool to mount (render_type = 'tool').
    toolKey: text("tool_key"),
    title: text("title").notNull(),
    metaTitle: text("meta_title").notNull(),
    metaDescription: text("meta_description").notNull(),
    ogImageKey: text("og_image_key"),
    blocks: jsonb("blocks").$type<LandingBlock[]>().notNull().default([]),
    faq: jsonb("faq").$type<FaqItem[]>(),
    // Static HTML snapshot of the body, generated at publish for crawlers.
    renderedHtml: text("rendered_html"),
    status: landingStatus("status").notNull().default("draft"),
    noindex: boolean("noindex").notNull().default(false),
    canonicalUrl: text("canonical_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: unique("landing_pages_slug_unique").on(t.slug),
    statusIdx: index("landing_pages_status_idx").on(t.status),
    categoryIdx: index("landing_pages_category_idx").on(t.category),
  }),
);

export type LandingPageRow = typeof landingPages.$inferSelect;
