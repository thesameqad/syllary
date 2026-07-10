ALTER TABLE "song_videos" ADD COLUMN IF NOT EXISTS "thumb_key" text;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "use_cover_for_video_thumb" boolean DEFAULT true NOT NULL;