ALTER TABLE "song_videos" ADD COLUMN "thumb_key" text;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "use_cover_for_video_thumb" boolean DEFAULT true NOT NULL;