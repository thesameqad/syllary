import type { FastifyInstance } from "fastify";
import { and, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import { FREE_SIGNED_UP_LIFETIME, type Song } from "@syllary/shared";
import { db } from "../db/client.js";
import { env } from "../env.js";
import { songs, type SongRow, users, type UserRow } from "../db/schema.js";
import { getAuthUserId } from "../lib/clerk.js";
import { objectSize, presignGet } from "../lib/r2.js";
import {
  getPrediction,
  startSeparation,
  startTranscription,
  vocalsUrlFromOutput,
} from "../lib/replicate.js";
import { buildLyrics } from "../lib/transcript.js";
import { getOrCreateUser } from "../lib/users.js";

// Two Replicate steps (Demucs + WhisperX), so allow more headroom than one.
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function getSongRow(id: string): Promise<SongRow | undefined> {
  const [row] = await db.select().from(songs).where(eq(songs.id, id)).limit(1);
  return row;
}

async function toSongDto(row: SongRow): Promise<Song> {
  const audioUrl = row.status === "ready" ? await presignGet(row.r2Key) : null;
  return {
    id: row.id,
    status: row.status,
    stage: row.stage ?? null,
    originalFilename: row.originalFilename,
    durationSeconds: row.durationSeconds,
    audioUrl,
    lyrics: row.lyrics ?? null,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

async function markFailed(id: string, error: string): Promise<SongRow | undefined> {
  const [row] = await db
    .update(songs)
    .set({ status: "failed", error, updatedAt: new Date() })
    .where(and(eq(songs.id, id), eq(songs.status, "processing")))
    .returning();
  return row;
}

async function finalizeIfDone(row: SongRow): Promise<SongRow> {
  const predictionId = row.replicatePredictionId;
  if (!predictionId) return row;

  if (Date.now() - row.createdAt.getTime() > PROCESSING_TIMEOUT_MS) {
    return (await markFailed(row.id, "Processing timed out.")) ?? row;
  }

  const prediction = await getPrediction(predictionId);
  if (prediction.status === "failed" || prediction.status === "canceled") {
    const what = row.stage === "separating" ? "Vocal isolation" : "Transcription";
    return (await markFailed(row.id, prediction.error ?? `${what} failed.`)) ?? row;
  }
  if (prediction.status !== "succeeded") return row;

  // Stage 1 done: hand the isolated vocals to WhisperX.
  if (row.stage === "separating") {
    const vocalsUrl = vocalsUrlFromOutput(prediction.output);
    if (!vocalsUrl) {
      return (await markFailed(row.id, "Vocal isolation produced no output.")) ?? row;
    }
    let transcriptionId: string;
    try {
      transcriptionId = await startTranscription(vocalsUrl);
    } catch {
      // Likely transient (rate limit); leave as-is and retry on the next poll.
      return row;
    }
    const [updated] = await db
      .update(songs)
      .set({ stage: "transcribing", replicatePredictionId: transcriptionId, updatedAt: new Date() })
      .where(and(eq(songs.id, row.id), eq(songs.status, "processing"), eq(songs.stage, "separating")))
      .returning();
    return updated ?? (await getSongRow(row.id)) ?? row;
  }

  // Stage 2 done: build and store lyrics.
  const lyrics = await buildLyrics(prediction.output);
  const lastEnd = lyrics.lines.at(-1)?.end;
  const duration =
    row.durationSeconds ?? (typeof lastEnd === "number" ? Math.round(lastEnd) : null);
  const [updated] = await db
    .update(songs)
    .set({
      status: "ready",
      stage: null,
      lyrics,
      language: lyrics.language,
      durationSeconds: duration,
      updatedAt: new Date(),
    })
    .where(and(eq(songs.id, row.id), eq(songs.status, "processing"), eq(songs.stage, "transcribing")))
    .returning();
  return updated ?? (await getSongRow(row.id)) ?? row;
}

export async function songsRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>("/songs/:id/process", async (req, reply) => {
    const row = await getSongRow(req.params.id);
    if (!row) return reply.code(404).send({ error: "Not found." });
    if (row.status !== "pending") return reply.send(await toSongDto(row));

    const size = await objectSize(row.r2Key);
    if (size === null) {
      return reply.code(400).send({ error: "Upload not found. Please try again." });
    }

    // Server-side quota check before any Replicate call (rule #2).
    const clerkId = await getAuthUserId(req);
    let authedUser: UserRow | null = null;
    if (clerkId) {
      authedUser = await getOrCreateUser(clerkId);
      if (authedUser.monthlyQuota == null) {
        if (authedUser.songsLifetime >= FREE_SIGNED_UP_LIFETIME) {
          return reply.code(429).send({
            error: "You've used your 3 free songs. Upgrade to keep making lyric files.",
          });
        }
      } else if (authedUser.songsThisPeriod >= authedUser.monthlyQuota) {
        return reply.code(429).send({
          error: "You've hit your plan's monthly limit. Upgrade or wait for your next cycle.",
        });
      }
    } else {
      // Anonymous: ANONYMOUS_DAILY_LIMIT transcription per UTC day, by IP+UA hash.
      const [usage] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(songs)
        .where(
          and(
            eq(songs.ownerHash, row.ownerHash),
            gte(songs.createdAt, startOfUtcDay()),
            isNotNull(songs.replicatePredictionId),
            ne(songs.id, row.id),
          ),
        );
      if ((usage?.count ?? 0) >= env.ANONYMOUS_DAILY_LIMIT) {
        return reply.code(429).send({
          error: "Free limit reached: 1 song per day. Sign up for 3 free, or upgrade for more.",
        });
      }
    }

    const audioUrl = await presignGet(row.r2Key);
    let predictionId: string;
    try {
      // Step 1: isolate vocals (Demucs); WhisperX runs on the stem in finalize.
      predictionId = await startSeparation(audioUrl);
    } catch (err) {
      req.log.error(err);
      await db
        .update(songs)
        .set({ status: "failed", error: "Could not start processing.", updatedAt: new Date() })
        .where(eq(songs.id, row.id));
      return reply.code(502).send({ error: "Could not start processing." });
    }

    const [updated] = await db
      .update(songs)
      .set({
        status: "processing",
        stage: "separating",
        replicatePredictionId: predictionId,
        updatedAt: new Date(),
      })
      .where(and(eq(songs.id, row.id), eq(songs.status, "pending")))
      .returning();

    // Count usage once transcription has started.
    if (authedUser) {
      await db
        .update(users)
        .set({
          songsLifetime: sql`${users.songsLifetime} + 1`,
          ...(authedUser.monthlyQuota != null
            ? { songsThisPeriod: sql`${users.songsThisPeriod} + 1` }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, authedUser.id));
    }

    return reply.send(await toSongDto(updated ?? row));
  });

  app.get<{ Params: { id: string } }>("/songs/:id", async (req, reply) => {
    let row = await getSongRow(req.params.id);
    if (!row) return reply.code(404).send({ error: "Not found." });

    if (row.status === "processing") {
      row = await finalizeIfDone(row);
    }
    return reply.send(await toSongDto(row));
  });
}
