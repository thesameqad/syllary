ALTER TABLE "songs" ADD COLUMN "artist" text;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "album" text;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "year" integer;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "insights" jsonb;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "audio_features" jsonb;