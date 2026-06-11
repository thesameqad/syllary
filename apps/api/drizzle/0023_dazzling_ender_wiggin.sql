CREATE TABLE "conversion_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"click_id" text NOT NULL,
	"conversion_name" text DEFAULT 'purchase' NOT NULL,
	"conversion_at" timestamp with time zone NOT NULL,
	"value_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"exported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "acquisition_click_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "acquisition_click_source" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "acquisition_utm" jsonb;--> statement-breakpoint
ALTER TABLE "conversion_exports" ADD CONSTRAINT "conversion_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversion_exports_pending_idx" ON "conversion_exports" USING btree ("exported_at");--> statement-breakpoint
CREATE INDEX "conversion_exports_source_idx" ON "conversion_exports" USING btree ("source");