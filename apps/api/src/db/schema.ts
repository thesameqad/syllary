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
import type { AudioFeatures, Lyrics, SongInsights, SongLink } from "@syllary/shared";

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
  lyrics: jsonb("lyrics").$type<Lyrics>(),
  insights: jsonb("insights").$type<SongInsights>(),
  audioFeatures: jsonb("audio_features").$type<AudioFeatures>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SongRow = typeof songs.$inferSelect;

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
