CREATE TYPE "public"."song_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "song_status" DEFAULT 'pending' NOT NULL,
	"original_filename" text NOT NULL,
	"r2_key" text NOT NULL,
	"content_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"duration_seconds" integer,
	"language" text,
	"owner_hash" text NOT NULL,
	"is_anonymous" boolean DEFAULT true NOT NULL,
	"replicate_prediction_id" text,
	"lyrics" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
