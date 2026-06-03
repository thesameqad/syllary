import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  catalogImportSchema,
  coverCommitSchema,
  coverImageTokens,
  coverPresignSchema,
  generateCoverSchema,
  updateAlbumSchema,
  updateArtistSchema,
} from "@syllary/shared";
import { db } from "../db/client.js";
import { albums, artists, songs, users } from "../db/schema.js";
import { getAuthUserId } from "../lib/clerk.js";
import { getOrCreateUser } from "../lib/users.js";
import { deleteObject, objectSize, presignGet, presignPut, putObject } from "../lib/r2.js";
import { generateCoverImage } from "../lib/cover-image.js";
import { upsertAlbum, upsertArtist } from "../lib/catalog.js";
import { fetchImageBuffer, resolveDeezer } from "../lib/deezer.js";

/** Download an external image into R2 under a fresh key; null on failure. */
async function storeExternalCover(prefix: string, id: string, url: string): Promise<string | null> {
  const img = await fetchImageBuffer(url);
  if (!img) return null;
  const key = `${prefix}/${id}-${randomUUID()}`;
  try {
    await putObject(key, img.buffer, img.contentType);
    return key;
  } catch {
    return null;
  }
}

// Generic cover-image flow (presign → PUT → commit, + AI generate) shared by the
// artist and album entities — mirrors the song-cover routes in songs.ts.
type CoverTarget = {
  prefix: string;
  load: (id: string, userId: string) => Promise<{ id: string; coverImageKey: string | null } | null>;
  setCover: (id: string, key: string) => Promise<void>;
};

const artistCover: CoverTarget = {
  prefix: "artist-covers",
  load: async (id, userId) => {
    const [r] = await db
      .select({ id: artists.id, coverImageKey: artists.coverImageKey })
      .from(artists)
      .where(and(eq(artists.id, id), eq(artists.userId, userId)))
      .limit(1);
    return r ?? null;
  },
  setCover: async (id, key) => {
    await db.update(artists).set({ coverImageKey: key, updatedAt: new Date() }).where(eq(artists.id, id));
  },
};

const albumCover: CoverTarget = {
  prefix: "album-covers",
  load: async (id, userId) => {
    const [r] = await db
      .select({ id: albums.id, coverImageKey: albums.coverImageKey })
      .from(albums)
      .where(and(eq(albums.id, id), eq(albums.userId, userId)))
      .limit(1);
    return r ?? null;
  },
  setCover: async (id, key) => {
    await db.update(albums).set({ coverImageKey: key, updatedAt: new Date() }).where(eq(albums.id, id));
  },
};

function registerCoverRoutes(app: FastifyInstance, base: "artists" | "albums", target: CoverTarget) {
  // Presign a direct-to-R2 PUT (owner-only).
  app.post<{ Params: { id: string } }>(`/${base}/:id/cover/presign`, async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const parsed = coverPresignSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Unsupported image type." });
    const row = await target.load(req.params.id, user.id);
    if (!row) return reply.code(404).send({ error: "Not found." });
    const key = `${target.prefix}/${row.id}-${randomUUID()}`;
    const uploadUrl = await presignPut(key, parsed.data.contentType);
    return reply.send({ uploadUrl, key });
  });

  // Commit a freshly-uploaded cover.
  app.post<{ Params: { id: string } }>(`/${base}/:id/cover`, async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const parsed = coverCommitSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
    const row = await target.load(req.params.id, user.id);
    if (!row) return reply.code(404).send({ error: "Not found." });
    const { key } = parsed.data;
    if (!key.startsWith(`${target.prefix}/${row.id}-`)) {
      return reply.code(400).send({ error: "Invalid cover key." });
    }
    const size = await objectSize(key);
    if (size === null) return reply.code(400).send({ error: "Upload not found — please retry." });
    if (size > 8 * 1024 * 1024) return reply.code(400).send({ error: "Image is too large (max 8MB)." });
    const oldKey = row.coverImageKey;
    await target.setCover(row.id, key);
    if (oldKey && oldKey !== key && oldKey.startsWith(`${target.prefix}/${row.id}`)) {
      await deleteObject(oldKey);
    }
    return reply.send({ coverUrl: await presignGet(key) });
  });

  // AI-generate a cover (charges credits on success, like the song-cover route).
  app.post<{ Params: { id: string } }>(`/${base}/:id/cover/generate`, async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const parsed = generateCoverSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Describe the image you want." });
    const row = await target.load(req.params.id, user.id);
    if (!row) return reply.code(404).send({ error: "Not found." });

    const cost = coverImageTokens(parsed.data.model);
    if (user.credits < cost) {
      return reply.code(402).send({
        error: `Not enough tokens — generating a cover costs ${cost}. Upgrade for more.`,
      });
    }
    let image: { buffer: Buffer; contentType: string };
    try {
      image = await generateCoverImage({ description: parsed.data.prompt, model: parsed.data.model });
    } catch (err) {
      req.log.error({ err }, "entity cover-generate failed");
      return reply.code(502).send({ error: "Couldn't generate the cover. Try again." });
    }
    const key = `${target.prefix}/${row.id}-${randomUUID()}`;
    try {
      await putObject(key, image.buffer, image.contentType);
    } catch (err) {
      req.log.error({ err }, "entity cover-generate upload failed");
      return reply.code(502).send({ error: "Couldn't store the generated cover. Try again." });
    }
    await db
      .update(users)
      .set({ credits: sql`GREATEST(${users.credits} - ${cost}, 0)`, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    return reply.send({ key, url: await presignGet(key) });
  });
}

export async function catalogRoutes(app: FastifyInstance) {
  // ---- Lists (power the organized Library) ----
  app.get("/artists", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const rows = await db.select().from(artists).where(eq(artists.userId, user.id));
    return reply.send(
      await Promise.all(
        rows.map(async (a) => ({
          id: a.id,
          name: a.name,
          coverUrl: a.coverImageKey ? await presignGet(a.coverImageKey) : null,
        })),
      ),
    );
  });

  app.get("/albums", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const rows = await db.select().from(albums).where(eq(albums.userId, user.id));
    return reply.send(
      await Promise.all(
        rows.map(async (a) => ({
          id: a.id,
          name: a.name,
          artistId: a.artistId,
          coverUrl: a.coverImageKey ? await presignGet(a.coverImageKey) : null,
          releaseDate: a.releaseDate ?? null,
          tracks: a.tracks ?? [],
        })),
      ),
    );
  });

  // ---- Edit entity metadata (name cascades to the song string cache) ----
  app.patch<{ Params: { id: string } }>("/artists/:id", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const parsed = updateArtistSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
    const [row] = await db
      .select()
      .from(artists)
      .where(and(eq(artists.id, req.params.id), eq(artists.userId, user.id)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "Not found." });
    if (parsed.data.name !== undefined && parsed.data.name !== row.name) {
      try {
        await db
          .update(artists)
          .set({ name: parsed.data.name, updatedAt: new Date() })
          .where(eq(artists.id, row.id));
      } catch {
        return reply.code(409).send({ error: "You already have an artist with that name." });
      }
      // Cascade the rename to the denormalized song cache.
      await db
        .update(songs)
        .set({ artist: parsed.data.name, updatedAt: new Date() })
        .where(eq(songs.artistId, row.id));
    }
    return reply.send({ ok: true });
  });

  app.patch<{ Params: { id: string } }>("/albums/:id", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const parsed = updateAlbumSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
    const [row] = await db
      .select()
      .from(albums)
      .where(and(eq(albums.id, req.params.id), eq(albums.userId, user.id)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "Not found." });
    const nameChanged = parsed.data.name !== undefined && parsed.data.name !== row.name;
    try {
      await db
        .update(albums)
        .set({
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.releaseDate !== undefined ? { releaseDate: parsed.data.releaseDate } : {}),
          updatedAt: new Date(),
        })
        .where(eq(albums.id, row.id));
    } catch {
      return reply.code(409).send({ error: "You already have an album with that name." });
    }
    if (nameChanged) {
      await db
        .update(songs)
        .set({ album: parsed.data.name!, updatedAt: new Date() })
        .where(eq(songs.albumId, row.id));
    }
    return reply.send({ ok: true });
  });

  registerCoverRoutes(app, "artists", artistCover);
  registerCoverRoutes(app, "albums", albumCover);

  // ---- Import an artist/album catalog from Deezer (metadata only) ----
  // Pre-builds the artist + album entities (names, covers, release dates) so the
  // user can then upload their own audio per track. No audio/lyrics imported.
  app.post("/catalog/import", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const parsed = catalogImportSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Provide a Deezer artist or album link." });

    const data = await resolveDeezer(parsed.data.url);
    if (!data) {
      return reply.code(404).send({ error: "Couldn't find that. Paste a Deezer artist or album link." });
    }

    const artistId = await upsertArtist(user.id, data.artistName);
    // Fill the artist cover only if it doesn't have one yet.
    const [art] = await db
      .select({ coverImageKey: artists.coverImageKey })
      .from(artists)
      .where(eq(artists.id, artistId))
      .limit(1);
    if (data.artistCoverUrl && !art?.coverImageKey) {
      const key = await storeExternalCover("artist-covers", artistId, data.artistCoverUrl);
      if (key) await db.update(artists).set({ coverImageKey: key, updatedAt: new Date() }).where(eq(artists.id, artistId));
    }

    let albumsImported = 0;
    let tracks = 0;
    for (const al of data.albums) {
      const albumId = await upsertAlbum(user.id, artistId, al.name);
      const [cur] = await db
        .select({ releaseDate: albums.releaseDate, coverImageKey: albums.coverImageKey })
        .from(albums)
        .where(eq(albums.id, albumId))
        .limit(1);
      const set: {
        releaseDate?: string;
        coverImageKey?: string;
        tracks?: { title: string; position: number | null }[];
      } = {};
      if (al.releaseDate && !cur?.releaseDate) set.releaseDate = al.releaseDate;
      if (al.coverUrl && !cur?.coverImageKey) {
        const key = await storeExternalCover("album-covers", albumId, al.coverUrl);
        if (key) set.coverImageKey = key;
      }
      if (al.tracks.length > 0) {
        set.tracks = al.tracks.map((t) => ({ title: t.title, position: t.position }));
      }
      if (Object.keys(set).length > 0) {
        await db.update(albums).set({ ...set, updatedAt: new Date() }).where(eq(albums.id, albumId));
      }
      albumsImported++;
      tracks += al.tracks.length;
    }

    return reply.send({ artistId, artistName: data.artistName, albumsImported, tracks });
  });
}
