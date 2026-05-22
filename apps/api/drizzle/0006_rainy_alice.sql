ALTER TABLE "users" ADD COLUMN "display_name" text;--> statement-breakpoint
UPDATE "users" SET "display_name" = split_part("email", '@', 1) WHERE "display_name" IS NULL AND "email" IS NOT NULL;