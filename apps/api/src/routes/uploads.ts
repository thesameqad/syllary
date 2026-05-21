import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  extensionOf,
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

export async function uploadsRoutes(app: FastifyInstance) {
  app.post("/uploads/presign", async (req, reply) => {
    const parsed = presignRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request." });
    }
    const { filename, contentType, size, durationSeconds } = parsed.data;

    if (!isAcceptedExtension(filename)) {
      return reply.code(400).send({ error: "Use an MP3, WAV, or FLAC file." });
    }
    if (size > MAX_FILE_BYTES) {
      return reply.code(400).send({ error: "File is too large (max 60MB)." });
    }
    if (durationSeconds != null && durationSeconds > MAX_DURATION_SECONDS) {
      return reply.code(400).send({ error: "Track is over 3 minutes." });
    }

    const id = randomUUID();
    const key = `uploads/${id}${extensionOf(filename)}`;
    const clerkId = await getAuthUserId(req);
    const hash = clerkId ? `clerk:${clerkId}` : ownerHash(req.ip, req.headers["user-agent"] ?? "");

    await db.insert(songs).values({
      id,
      status: "pending",
      originalFilename: filename,
      r2Key: key,
      contentType,
      fileSize: size,
      durationSeconds: durationSeconds != null ? Math.round(durationSeconds) : null,
      ownerHash: hash,
      isAnonymous: !clerkId,
    });

    const uploadUrl = await presignPut(key, contentType);
    return reply.send({ songId: id, uploadUrl, key });
  });
}
