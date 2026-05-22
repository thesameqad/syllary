ALTER TABLE "songs" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "cover_image_key" text;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "credits" integer DEFAULT 1000 NOT NULL;