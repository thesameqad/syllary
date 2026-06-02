CREATE TABLE "song_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"model" text NOT NULL,
	"video_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_videos_song_model_unique" UNIQUE("song_id","model")
);
--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "public_video_model" text;--> statement-breakpoint
ALTER TABLE "song_videos" ADD CONSTRAINT "song_videos_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;