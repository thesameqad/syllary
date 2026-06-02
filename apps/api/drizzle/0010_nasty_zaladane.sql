CREATE TYPE "public"."video_job_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "video_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"user_id" uuid,
	"status" "video_job_status" DEFAULT 'pending' NOT NULL,
	"mode" text DEFAULT 'autopilot' NOT NULL,
	"model" text DEFAULT 'fast' NOT NULL,
	"style_description" text NOT NULL,
	"aspect_ratio" text DEFAULT '16:9' NOT NULL,
	"motion_mode" text DEFAULT 'ffmpeg' NOT NULL,
	"total_segments" integer DEFAULT 0 NOT NULL,
	"completed_segments" integer DEFAULT 0 NOT NULL,
	"segments" jsonb,
	"video_key" text,
	"error" text,
	"tokens_charged" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "latest_video_key" text;--> statement-breakpoint
ALTER TABLE "video_jobs" ADD CONSTRAINT "video_jobs_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_jobs" ADD CONSTRAINT "video_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_jobs_song_idx" ON "video_jobs" USING btree ("song_id");