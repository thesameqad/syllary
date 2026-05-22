import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { count, eq } from "drizzle-orm";
import {
  extensionOf,
  FREE_SONG_LIMIT,
  isAcceptedExtension,
  MAX_DURATION_SECONDS,
  MAX_FILE_BYTES,
  presignRequestSchema,
} from "@syllary/shared";
import { db } from "../db/client.js";
import { songs } from "../db/schema.js";
import { getAuthUserId } from "../lib/clerk.js";
import { ownerHash } from "../lib/hash.js";
import { presignPut } from "../lib/r2.js";
import { getOrCreateUser } from "../lib/users.js";

export async function uploadsRoutes(app: FastifyInstance) {
  app.post("/uploads/presign", async (req, reply) => {
    const parsed = presignRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request." });
    }
    const { filename, contentType, size, durationSeconds, title, artist, album, year, coverContentType } =
      parsed.data;

    if (!isAcceptedExtension(filename)) {
      return reply.code(400).send({ error: "Use an MP3, WAV, or FLAC file." });
    }
    if (size > MAX_FILE_BYTES) {
      return reply.code(400).send({ error: "File is too large (max 60MB)." });
    }

    const clerkId = await getAuthUserId(req);
    const userRow = clerkId ? await getOrCreateUser(clerkId) : null;

    // Anonymous users are capped at 3 minutes; signed-in users are not.
    if (!userRow && durationSeconds != null && durationSeconds > MAX_DURATION_SECONDS) {
      return reply.code(400).send({ error: "Track is over 3 minutes. Sign up to remove the limit." });
    }

    // Free tier may keep at most FREE_SONG_LIMIT songs in their library.
    if (userRow && userRow.plan === "free") {
      const rows = await db
        .select({ value: count() })
        .from(songs)
        .where(eq(songs.userId, userRow.id));
      if ((rows[0]?.value ?? 0) >= FREE_SONG_LIMIT) {
        return reply.code(409).send({
          error: `Free libraries hold up to ${FREE_SONG_LIMIT} songs. Delete one or upgrade.`,
        });
      }
    }

    const id = randomUUID();
    const key = `uploads/${id}${extensionOf(filename)}`;
    const hash = clerkId ? `clerk:${clerkId}` : ownerHash(req.ip, req.headers["user-agent"] ?? "");

    let coverImageKey: string | null = null;
    let coverUploadUrl: string | undefined;
    if (coverContentType) {
      coverImageKey = `covers/${id}`;
      coverUploadUrl = await presignPut(coverImageKey, coverContentType);
    }

    await db.insert(songs).values({
      id,
      status: "pending",
      originalFilename: filename,
      title: title ?? filename,
      artist: artist ?? null,
      album: album ?? null,
      year: year ?? null,
      r2Key: key,
      coverImageKey,
      contentType,
      fileSize: size,
      durationSeconds: durationSeconds != null ? Math.round(durationSeconds) : null,
      ownerHash: hash,
      userId: userRow?.id ?? null,
      isAnonymous: !clerkId,
    });

    const uploadUrl = await presignPut(key, contentType);
    return reply.send({ songId: id, uploadUrl, key, coverUploadUrl });
  });
}
