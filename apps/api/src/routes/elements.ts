import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  coverCommitSchema,
  coverImageTokens,
  createElementSchema,
  generateCoverSchema,
  updateElementSchema,
} from "@syllary/shared";
import { db } from "../db/client.js";
import { bandMembers, songElements, type SongElementRow, songs, users } from "../db/schema.js";
import { getAuthUserId } from "../lib/clerk.js";
import { getOrCreateUser } from "../lib/users.js";
import { generateElementImage } from "../lib/cover-image.js";
import { suggestCharacterOutfit } from "../lib/openrouter.js";
import { deleteObject, objectSize, presignGet, putObject } from "../lib/r2.js";

const IMAGE_PREFIX = "song-elements";

/** Serialize an element row → client DTO with a presigned image URL. */
async function toElementDto(row: SongElementRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    imageUrl: row.imageKey ? await presignGet(row.imageKey) : null,
    sourceMemberId: row.sourceMemberId ?? null,
  };
}

/** The source band member's reference photo R2 keys, owner-scoped. Empty if the
 *  member is gone or has no photos. */
async function loadMemberImageKeys(memberId: string, userId: string): Promise<string[]> {
  const [row] = await db
    .select({ images: bandMembers.images, name: bandMembers.name })
    .from(bandMembers)
    .where(and(eq(bandMembers.id, memberId), eq(bandMembers.userId, userId)))
    .limit(1);
  return row ? (row.images ?? []).map((i) => i.key) : [];
}

/** Verify the caller owns the song (elements are song-scoped). */
async function ownsSong(songId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: songs.id })
    .from(songs)
    .where(and(eq(songs.id, songId), eq(songs.userId, userId)))
    .limit(1);
  return !!row;
}

/** Load an element the caller owns (by song + element id), or null. */
async function loadElement(
  songId: string,
  elementId: string,
  userId: string,
): Promise<SongElementRow | null> {
  const [row] = await db
    .select()
    .from(songElements)
    .where(
      and(
        eq(songElements.id, elementId),
        eq(songElements.songId, songId),
        eq(songElements.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function elementRoutes(app: FastifyInstance) {
  // List a song's persisted elements (owner-only).
  app.get<{ Params: { id: string } }>("/songs/:id/elements", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    if (!(await ownsSong(req.params.id, user.id))) {
      return reply.code(404).send({ error: "Not found." });
    }
    const rows = await db.select().from(songElements).where(eq(songElements.songId, req.params.id));
    return reply.send(await Promise.all(rows.map(toElementDto)));
  });

  // Create an element under a song (its image is generated separately).
  app.post<{ Params: { id: string } }>("/songs/:id/elements", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Sign in to add elements." });
    const user = await getOrCreateUser(clerkId);
    const parsed = createElementSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
    if (!(await ownsSong(req.params.id, user.id))) {
      return reply.code(404).send({ error: "Not found." });
    }
    // A customized cast member is seeded from a band member — verify ownership so we
    // never link to someone else's member.
    let sourceMemberId: string | null = null;
    if (parsed.data.sourceMemberId) {
      const keys = await loadMemberImageKeys(parsed.data.sourceMemberId, user.id);
      if (keys.length === 0) {
        return reply.code(400).send({ error: "That cast member has no reference photos." });
      }
      sourceMemberId = parsed.data.sourceMemberId;
    }
    try {
      const [row] = await db
        .insert(songElements)
        .values({
          songId: req.params.id,
          userId: user.id,
          name: parsed.data.name,
          description: parsed.data.description?.trim() || null,
          sourceMemberId,
        })
        .returning();
      return reply.send(await toElementDto(row!));
    } catch {
      return reply
        .code(409)
        .send({ error: "You already have an element with that name for this song." });
    }
  });

  // Rename / re-describe an element.
  app.patch<{ Params: { id: string; elementId: string } }>(
    "/songs/:id/elements/:elementId",
    async (req, reply) => {
      const clerkId = await getAuthUserId(req);
      if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
      const user = await getOrCreateUser(clerkId);
      const parsed = updateElementSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
      const row = await loadElement(req.params.id, req.params.elementId, user.id);
      if (!row) return reply.code(404).send({ error: "Not found." });
      const patch: Partial<{ name: string; description: string | null }> = {};
      if (parsed.data.name !== undefined) patch.name = parsed.data.name;
      if (parsed.data.description !== undefined) {
        patch.description = parsed.data.description?.trim() || null;
      }
      if (Object.keys(patch).length === 0) return reply.send(await toElementDto(row));
      try {
        const [updated] = await db
          .update(songElements)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(songElements.id, row.id))
          .returning();
        return reply.send(await toElementDto(updated!));
      } catch {
        return reply
          .code(409)
          .send({ error: "You already have an element with that name for this song." });
      }
    },
  );

  // Delete an element and its reference image.
  app.delete<{ Params: { id: string; elementId: string } }>(
    "/songs/:id/elements/:elementId",
    async (req, reply) => {
      const clerkId = await getAuthUserId(req);
      if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
      const user = await getOrCreateUser(clerkId);
      const row = await loadElement(req.params.id, req.params.elementId, user.id);
      if (!row) return reply.code(404).send({ error: "Not found." });
      if (row.imageKey) await deleteObject(row.imageKey);
      await db.delete(songElements).where(eq(songElements.id, row.id));
      return reply.send({ ok: true });
    },
  );

  // AI-generate a reference image for an element (cheap flux or premium Nano Banana).
  // Stores it under a fresh key (NOT yet attached), charges coverImageTokens on
  // success only, and returns the key + a presigned preview URL — the client can
  // preview, regenerate, save (commit), or discard. Same pricing as cover gen.
  app.post<{ Params: { id: string; elementId: string } }>(
    "/songs/:id/elements/:elementId/image/generate",
    async (req, reply) => {
      const clerkId = await getAuthUserId(req);
      if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
      const user = await getOrCreateUser(clerkId);
      const parsed = generateCoverSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "Describe the element you want." });
      const row = await loadElement(req.params.id, req.params.elementId, user.id);
      if (!row) return reply.code(404).send({ error: "Not found." });

      // Customized cast member: lock the source member's face by conditioning on
      // their photos. This requires the reference-capable Nano path (FLUX can't take
      // references), so the model + cost are forced regardless of the request.
      let referenceUrls: string[] | undefined;
      if (row.sourceMemberId) {
        const keys = await loadMemberImageKeys(row.sourceMemberId, user.id);
        if (keys.length === 0) {
          return reply.code(400).send({ error: "That cast member has no reference photos." });
        }
        referenceUrls = await Promise.all(keys.map((k) => presignGet(k)));
      }
      const model = referenceUrls ? "nano" : parsed.data.model;

      const cost = coverImageTokens(model);
      if (user.credits < cost) {
        return reply.code(402).send({
          error: `Not enough tokens — generating an element image costs ${cost}. Upgrade for more.`,
        });
      }

      // Customized cast members bake the video's art direction into the reference so
      // it matches the scenes' style (e.g. manga, not a realistic photo).
      const style =
        referenceUrls && typeof (req.body as { style?: unknown }).style === "string"
          ? (req.body as { style: string }).style
          : undefined;

      let image: { buffer: Buffer; contentType: string };
      try {
        image = await generateElementImage({
          name: row.name,
          description: parsed.data.prompt,
          model,
          referenceUrls,
          style,
        });
      } catch (err) {
        req.log.error({ err }, "element-image-generate failed");
        return reply.code(502).send({ error: "Couldn't generate the image. Try again." });
      }

      const key = `${IMAGE_PREFIX}/${row.id}-${randomUUID()}`;
      try {
        await putObject(key, image.buffer, image.contentType);
      } catch (err) {
        req.log.error({ err }, "element-image upload failed");
        return reply.code(502).send({ error: "Couldn't store the image. Try again." });
      }

      // Remember the description (prefilled on re-edit) + charge after success.
      await db
        .update(songElements)
        .set({ description: parsed.data.prompt.trim(), updatedAt: new Date() })
        .where(eq(songElements.id, row.id));
      await db
        .update(users)
        .set({ credits: sql`GREATEST(${users.credits} - ${cost}, 0)`, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      return reply.send({ key, url: await presignGet(key) });
    },
  );

  // Commit a generated image as the element's reference photo.
  app.post<{ Params: { id: string; elementId: string } }>(
    "/songs/:id/elements/:elementId/image",
    async (req, reply) => {
      const clerkId = await getAuthUserId(req);
      if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
      const user = await getOrCreateUser(clerkId);
      const parsed = coverCommitSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
      const row = await loadElement(req.params.id, req.params.elementId, user.id);
      if (!row) return reply.code(404).send({ error: "Not found." });
      const { key } = parsed.data;
      if (!key.startsWith(`${IMAGE_PREFIX}/${row.id}-`)) {
        return reply.code(400).send({ error: "Invalid image key." });
      }
      const size = await objectSize(key);
      if (size === null) return reply.code(400).send({ error: "Image not found — please retry." });

      const oldKey = row.imageKey;
      const [updated] = await db
        .update(songElements)
        .set({ imageKey: key, updatedAt: new Date() })
        .where(eq(songElements.id, row.id))
        .returning();
      if (oldKey && oldKey !== key && oldKey.startsWith(`${IMAGE_PREFIX}/${row.id}`)) {
        await deleteObject(oldKey);
      }
      return reply.send(await toElementDto(updated!));
    },
  );

  // Suggest a wardrobe/hair look for a customized cast member, fitting the chosen
  // video style + this song. Owner-only; best-effort (returns "" on AI failure).
  app.post<{ Params: { id: string }; Body: { memberId?: string; style?: string } }>(
    "/songs/:id/elements/suggest-outfit",
    async (req, reply) => {
      const clerkId = await getAuthUserId(req);
      if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
      const user = await getOrCreateUser(clerkId);
      const memberId = typeof req.body?.memberId === "string" ? req.body.memberId : "";
      if (!memberId) return reply.code(400).send({ error: "Invalid request." });
      const [song] = await db
        .select({ insights: songs.insights })
        .from(songs)
        .where(and(eq(songs.id, req.params.id), eq(songs.userId, user.id)))
        .limit(1);
      if (!song) return reply.code(404).send({ error: "Not found." });
      const [member] = await db
        .select({ name: bandMembers.name })
        .from(bandMembers)
        .where(and(eq(bandMembers.id, memberId), eq(bandMembers.userId, user.id)))
        .limit(1);
      if (!member) return reply.code(404).send({ error: "Not found." });
      const outfit = await suggestCharacterOutfit({
        memberName: member.name,
        style: typeof req.body?.style === "string" ? req.body.style : "",
        songSummary: song.insights?.summary ?? "",
      });
      return reply.send({ outfit });
    },
  );
}
