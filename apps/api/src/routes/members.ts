import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  coverCommitSchema,
  coverPresignSchema,
  createBandMemberSchema,
  MEMBER_IMAGE_MAX,
  removeMemberImageSchema,
  updateBandMemberSchema,
} from "@syllary/shared";
import { db } from "../db/client.js";
import { artists, bandMembers, type BandMemberRow } from "../db/schema.js";
import { getAuthUserId } from "../lib/clerk.js";
import { getOrCreateUser } from "../lib/users.js";
import { deleteObject, objectSize, presignGet, presignPut } from "../lib/r2.js";

const IMAGE_PREFIX = "member-images";

/** Serialize a member row → client DTO with presigned image URLs. */
async function toMemberDto(row: BandMemberRow) {
  const images = await Promise.all(
    (row.images ?? []).map(async (img) => ({ key: img.key, url: await presignGet(img.key) })),
  );
  return { id: row.id, name: row.name, artistId: row.artistId, images };
}

/** Load a member the caller owns, or null. */
async function loadMember(id: string, userId: string): Promise<BandMemberRow | null> {
  const [row] = await db
    .select()
    .from(bandMembers)
    .where(and(eq(bandMembers.id, id), eq(bandMembers.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Verify the artist (band) belongs to the caller. */
async function ownsArtist(artistId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(and(eq(artists.id, artistId), eq(artists.userId, userId)))
    .limit(1);
  return !!row;
}

export async function memberRoutes(app: FastifyInstance) {
  // List all the user's band members (across bands) — powers the Library tab and
  // the video-modal character picker.
  app.get("/members", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const rows = await db.select().from(bandMembers).where(eq(bandMembers.userId, user.id));
    return reply.send(await Promise.all(rows.map(toMemberDto)));
  });

  // Create a member under one of the user's bands.
  app.post("/members", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const parsed = createBandMemberSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
    if (!(await ownsArtist(parsed.data.artistId, user.id))) {
      return reply.code(404).send({ error: "Artist not found." });
    }
    try {
      const [row] = await db
        .insert(bandMembers)
        .values({ userId: user.id, artistId: parsed.data.artistId, name: parsed.data.name, images: [] })
        .returning();
      return reply.send(await toMemberDto(row!));
    } catch {
      return reply.code(409).send({ error: "You already have a cast member with that name for this artist." });
    }
  });

  // Rename and/or reassign a member to another of the user's bands.
  app.patch<{ Params: { id: string } }>("/members/:id", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const parsed = updateBandMemberSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
    const row = await loadMember(req.params.id, user.id);
    if (!row) return reply.code(404).send({ error: "Not found." });
    if (parsed.data.artistId && !(await ownsArtist(parsed.data.artistId, user.id))) {
      return reply.code(404).send({ error: "Artist not found." });
    }
    const patch: Partial<{ name: string; artistId: string }> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.artistId !== undefined) patch.artistId = parsed.data.artistId;
    if (Object.keys(patch).length === 0) return reply.send(await toMemberDto(row));
    try {
      const [updated] = await db
        .update(bandMembers)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(bandMembers.id, row.id))
        .returning();
      return reply.send(await toMemberDto(updated!));
    } catch {
      return reply.code(409).send({ error: "You already have a cast member with that name for this artist." });
    }
  });

  // Delete a member and all of its uploaded images.
  app.delete<{ Params: { id: string } }>("/members/:id", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const row = await loadMember(req.params.id, user.id);
    if (!row) return reply.code(404).send({ error: "Not found." });
    for (const img of row.images ?? []) await deleteObject(img.key);
    await db.delete(bandMembers).where(eq(bandMembers.id, row.id));
    return reply.send({ ok: true });
  });

  // Presign a direct-to-R2 PUT for a new member photo (owner-only, capped).
  app.post<{ Params: { id: string } }>("/members/:id/images/presign", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const parsed = coverPresignSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Unsupported image type." });
    const row = await loadMember(req.params.id, user.id);
    if (!row) return reply.code(404).send({ error: "Not found." });
    if ((row.images ?? []).length >= MEMBER_IMAGE_MAX) {
      return reply.code(400).send({ error: `Each cast member can have at most ${MEMBER_IMAGE_MAX} photos.` });
    }
    const key = `${IMAGE_PREFIX}/${row.id}-${randomUUID()}`;
    const uploadUrl = await presignPut(key, parsed.data.contentType);
    return reply.send({ uploadUrl, key });
  });

  // Commit a freshly-uploaded photo: append it to the member's image array.
  app.post<{ Params: { id: string } }>("/members/:id/images", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const parsed = coverCommitSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
    const row = await loadMember(req.params.id, user.id);
    if (!row) return reply.code(404).send({ error: "Not found." });
    const { key } = parsed.data;
    if (!key.startsWith(`${IMAGE_PREFIX}/${row.id}-`)) {
      return reply.code(400).send({ error: "Invalid image key." });
    }
    const current = row.images ?? [];
    if (current.length >= MEMBER_IMAGE_MAX) {
      return reply.code(400).send({ error: `Each cast member can have at most ${MEMBER_IMAGE_MAX} photos.` });
    }
    const size = await objectSize(key);
    if (size === null) return reply.code(400).send({ error: "Upload not found — please retry." });
    if (size > 8 * 1024 * 1024) return reply.code(400).send({ error: "Image is too large (max 8MB)." });
    if (current.some((img) => img.key === key)) return reply.send(await toMemberDto(row));
    const [updated] = await db
      .update(bandMembers)
      .set({ images: [...current, { key }], updatedAt: new Date() })
      .where(eq(bandMembers.id, row.id))
      .returning();
    return reply.send(await toMemberDto(updated!));
  });

  // Remove one photo from a member (delete the R2 object after the DB write).
  app.delete<{ Params: { id: string } }>("/members/:id/images", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const parsed = removeMemberImageSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
    const row = await loadMember(req.params.id, user.id);
    if (!row) return reply.code(404).send({ error: "Not found." });
    const next = (row.images ?? []).filter((img) => img.key !== parsed.data.key);
    const [updated] = await db
      .update(bandMembers)
      .set({ images: next, updatedAt: new Date() })
      .where(eq(bandMembers.id, row.id))
      .returning();
    await deleteObject(parsed.data.key);
    return reply.send(await toMemberDto(updated!));
  });
}
