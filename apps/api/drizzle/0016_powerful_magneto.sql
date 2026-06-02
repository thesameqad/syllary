ALTER TABLE "song_videos" ADD COLUMN "is_preview" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "video_jobs" ADD COLUMN "is_preview" boolean DEFAULT false NOT NULL;