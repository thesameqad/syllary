ALTER TABLE "song_videos" ADD COLUMN IF NOT EXISTS "scene_grouping" text DEFAULT 'line' NOT NULL;--> statement-breakpoint
ALTER TABLE "video_jobs" ADD COLUMN IF NOT EXISTS "scene_grouping" text DEFAULT 'line' NOT NULL;
