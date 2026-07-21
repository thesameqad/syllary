ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "comp_video_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "video_jobs" ADD COLUMN IF NOT EXISTS "is_comp" boolean DEFAULT false NOT NULL;
