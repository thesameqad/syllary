CREATE TYPE "public"."landing_category" AS ENUM('convert', 'tools', 'compare', 'guides');--> statement-breakpoint
CREATE TYPE "public"."landing_render_type" AS ENUM('content', 'tool');--> statement-breakpoint
CREATE TYPE "public"."landing_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "landing_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"category" "landing_category" NOT NULL,
	"render_type" "landing_render_type" DEFAULT 'content' NOT NULL,
	"tool_key" text,
	"title" text NOT NULL,
	"meta_title" text NOT NULL,
	"meta_description" text NOT NULL,
	"og_image_key" text,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"faq" jsonb,
	"rendered_html" text,
	"status" "landing_status" DEFAULT 'draft' NOT NULL,
	"noindex" boolean DEFAULT false NOT NULL,
	"canonical_url" text,
	"published_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "landing_pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "acquisition_landing_slug" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "acquisition_landing_slug" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "acquisition_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "landing_pages_status_idx" ON "landing_pages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "landing_pages_category_idx" ON "landing_pages" USING btree ("category");--> statement-breakpoint
CREATE INDEX "songs_acquisition_idx" ON "songs" USING btree ("acquisition_landing_slug");--> statement-breakpoint
CREATE INDEX "users_acquisition_idx" ON "users" USING btree ("acquisition_landing_slug");