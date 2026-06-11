CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_log_user_kind_unique" UNIQUE("user_id","kind")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_log_user_idx" ON "email_log" USING btree ("user_id");