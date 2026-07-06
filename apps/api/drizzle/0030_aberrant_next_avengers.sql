CREATE TABLE "showcase_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "showcase_items_tag_song_unique" UNIQUE("tag_id","song_id")
);
--> statement-breakpoint
CREATE TABLE "showcase_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "showcase_tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "showcase_items" ADD CONSTRAINT "showcase_items_tag_id_showcase_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."showcase_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "showcase_items" ADD CONSTRAINT "showcase_items_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;