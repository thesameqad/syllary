import type { FastifyInstance } from "fastify";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { ShowcaseSection, ShowcaseTagAdmin, ShowcaseVideo } from "@syllary/shared";
import { db } from "../db/client.js";
import { showcaseItems, showcaseTags, songs, type SongRow } from "../db/schema.js";
import { requireAdmin } from "../lib/admin.js";
import { presignGet } from "../lib/r2.js";
import { publicVideoFor } from "./songs.js";

// ---------------------------------------------------------------------------
// Dashboard showcase: admin-curated categories ("abstract", "living scenes", …)
// each holding hand-picked PUBLIC videos. The public GET powers the dashboard
// rows; the /admin routes power tag management + assignment (Showcase button on
// public pages). Items reference the SONG — each renders whatever style its
// owner currently exposes as public, and silently drops out if the song stops
// being public.
// ---------------------------------------------------------------------------

const createTagSchema = z.object({ name: z.string().trim().min(1).max(40) });
const setSongTagsSchema = z.object({ tagIds: z.array(z.string().uuid()).max(50) });

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** A song qualifies for showcase display while it's public + ready and its
 *  owner still exposes a public video style. */
function isShowable(row: SongRow): boolean {
  return row.isPublic && row.status === "ready" && !!row.publicVideoModel;
}

async function toShowcaseVideo(row: SongRow): Promise<ShowcaseVideo> {
  const video = await publicVideoFor(row);
  // Card art honors the owner's thumbnail choice: a frame captured from the
  // video when they opted out of the cover image (falling back to the cover).
  const coverKey =
    !row.useCoverForVideoThumb && video?.thumbKey ? video.thumbKey : row.coverImageKey;
  return {
    songId: row.id,
    title: row.title ?? row.originalFilename,
    artist: row.artist,
    coverUrl: coverKey ? await presignGet(coverKey) : null,
    videoUrl: video ? await presignGet(video.videoKey) : null,
  };
}

export function showcaseRoutes(app: FastifyInstance, _opts: unknown, done: () => void) {
  // Public: every non-empty showcase row, curated order.
  app.get("/showcase", async (_req, reply) => {
    const tags = await db
      .select()
      .from(showcaseTags)
      .orderBy(asc(showcaseTags.sortOrder), asc(showcaseTags.createdAt));
    if (tags.length === 0) return reply.send([]);
    const items = await db
      .select({ item: showcaseItems, song: songs })
      .from(showcaseItems)
      .innerJoin(songs, eq(showcaseItems.songId, songs.id))
      .where(inArray(showcaseItems.tagId, tags.map((t) => t.id)))
      .orderBy(asc(showcaseItems.sortOrder), desc(showcaseItems.createdAt));

    const sections: ShowcaseSection[] = [];
    for (const tag of tags) {
      const rows = items.filter((r) => r.item.tagId === tag.id && isShowable(r.song));
      if (rows.length === 0) continue;
      sections.push({
        tag: { id: tag.id, name: tag.name, slug: tag.slug, sortOrder: tag.sortOrder },
        videos: await Promise.all(rows.map((r) => toShowcaseVideo(r.song))),
      });
    }
    return reply.send(sections);
  });

  // ---- Admin ----

  app.get("/admin/showcase/tags", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const rows = await db
      .select({
        id: showcaseTags.id,
        name: showcaseTags.name,
        slug: showcaseTags.slug,
        sortOrder: showcaseTags.sortOrder,
        itemCount: sql<number>`(select count(*)::int from ${showcaseItems} where ${showcaseItems.tagId} = ${showcaseTags.id})`,
      })
      .from(showcaseTags)
      .orderBy(asc(showcaseTags.sortOrder), asc(showcaseTags.createdAt));
    return reply.send(rows satisfies ShowcaseTagAdmin[]);
  });

  app.post("/admin/showcase/tags", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const parsed = createTagSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Give the tag a name (≤40 chars)." });
    const name = parsed.data.name;
    const slug = slugify(name);
    if (!slug) return reply.code(400).send({ error: "That name has no usable characters." });
    const [existing] = await db.select().from(showcaseTags).where(eq(showcaseTags.slug, slug)).limit(1);
    if (existing) return reply.code(409).send({ error: "A tag with that name already exists." });
    const [tag] = await db.insert(showcaseTags).values({ name, slug }).returning();
    return reply.send({ id: tag!.id, name: tag!.name, slug: tag!.slug, sortOrder: tag!.sortOrder });
  });

  app.delete<{ Params: { id: string } }>("/admin/showcase/tags/:id", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    await db.delete(showcaseTags).where(eq(showcaseTags.id, req.params.id));
    return reply.send({ ok: true });
  });

  // The tags a given song is currently showcased under (drives the checkboxes).
  app.get<{ Params: { songId: string } }>(
    "/admin/showcase/songs/:songId/tags",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      const rows = await db
        .select({ tagId: showcaseItems.tagId })
        .from(showcaseItems)
        .where(eq(showcaseItems.songId, req.params.songId));
      return reply.send(rows.map((r) => r.tagId));
    },
  );

  // Replace a song's showcase assignments with exactly this tag set.
  app.put<{ Params: { songId: string } }>(
    "/admin/showcase/songs/:songId/tags",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      const parsed = setSongTagsSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid tag list." });
      const [song] = await db.select().from(songs).where(eq(songs.id, req.params.songId)).limit(1);
      if (!song) return reply.code(404).send({ error: "Song not found." });
      if (parsed.data.tagIds.length > 0 && !isShowable(song)) {
        return reply
          .code(400)
          .send({ error: "This song has no public video — publish one before showcasing it." });
      }
      await db.transaction(async (tx) => {
        await tx.delete(showcaseItems).where(eq(showcaseItems.songId, song.id));
        if (parsed.data.tagIds.length > 0) {
          await tx
            .insert(showcaseItems)
            .values(parsed.data.tagIds.map((tagId) => ({ tagId, songId: song.id })))
            .onConflictDoNothing();
        }
      });
      return reply.send({ ok: true });
    },
  );

  done();
}
