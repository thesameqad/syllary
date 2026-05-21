import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { Lyrics } from "@syllary/shared";

// Keep in sync with SONG_STATUSES in @syllary/shared.
export const songStatus = pgEnum("song_status", ["pending", "processing", "ready", "failed"]);

export const songs = pgTable("songs", {
  id: uuid("id").defaultRandom().primaryKey(),
  status: songStatus("status").notNull().default("pending"),
  stage: text("stage").$type<"separating" | "transcribing">(),
  originalFilename: text("original_filename").notNull(),
  r2Key: text("r2_key").notNull(),
  contentType: text("content_type").notNull(),
  fileSize: integer("file_size").notNull(),
  durationSeconds: integer("duration_seconds"),
  language: text("language"),
  ownerHash: text("owner_hash").notNull(),
  isAnonymous: boolean("is_anonymous").notNull().default(true),
  replicatePredictionId: text("replicate_prediction_id"),
  lyrics: jsonb("lyrics").$type<Lyrics>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SongRow = typeof songs.$inferSelect;

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  // free | starter | creator | pro
  plan: text("plan").notNull().default("free"),
  planStatus: text("plan_status"),
  // null for free tier (which uses a lifetime allowance instead)
  monthlyQuota: integer("monthly_quota"),
  songsThisPeriod: integer("songs_this_period").notNull().default(0),
  songsLifetime: integer("songs_lifetime").notNull().default(0),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;

// Stripe webhook idempotency (CLAUDE.md rule #1).
export const processedEvents = pgTable("processed_events", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
