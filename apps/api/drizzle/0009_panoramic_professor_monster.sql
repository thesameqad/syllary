ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "mode" text;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "processing_started_at" timestamp with time zone;
