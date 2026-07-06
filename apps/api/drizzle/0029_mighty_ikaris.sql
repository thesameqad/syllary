ALTER TABLE "song_videos" ADD COLUMN "scene_grouping" text DEFAULT 'line' NOT NULL;--> statement-breakpoint
ALTER TABLE "video_jobs" ADD COLUMN "scene_grouping" text DEFAULT 'line' NOT NULL;