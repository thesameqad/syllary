import type { FastifyInstance } from "fastify";
import { and, desc, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import {
  creditCost,
  editLyricsSchema,
  parseLyricsText,
  type PublicSong,
  type PublicTrackItem,
  rateSongSchema,
  type RatingSummary,
  type Song,
  type SongSummary,
  type Uploader,
  updateSongSchema,
} from "@syllary/shared";
import { db } from "../db/client.js";
import { env } from "../env.js";
import { ratings, songs, type SongRow, users, type UserRow } from "../db/schema.js";
import { getAuthUserId } from "../lib/clerk.js";
import { deleteObject, objectSize, presignGet } from "../lib/r2.js";
import {
  getPrediction,
  startSeparation,
  startTranscription,
  vocalsUrlFromOutput,
} from "../lib/replicate.js";
import { buildLyrics, realignFromText } from "../lib/transcript.js";
import { summarizeSong } from "../lib/openrouter.js";
import { estimateGenerationCost, recordEvent } from "../lib/analytics.js";
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

async function toSongDto(row: SongRow, canEdit = false): Promise<Song> {
  const audioUrl = row.status === "ready" ? await presignGet(row.r2Key) : null;
  const coverUrl = row.coverImageKey ? await presignGet(row.coverImageKey) : null;
  return {
    id: row.id,
    status: row.status,
    stage: row.stage ?? null,
    originalFilename: row.originalFilename,
    title: row.title ?? row.originalFilename,
    artist: row.artist,
    album: row.album,
    year: row.year,
    genre: row.genre,
    links: row.links ?? [],
    durationSeconds: row.durationSeconds,
    audioUrl,
    coverUrl,
    isPublic: row.isPublic,
    lyrics: row.lyrics ?? null,
    insights: row.insights ?? null,
    audioFeatures: row.audioFeatures ?? null,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    canEdit,
  };
}

async function toSongSummary(row: SongRow): Promise<SongSummary> {
  const coverUrl = row.coverImageKey ? await presignGet(row.coverImageKey) : null;
  return {
    id: row.id,
    title: row.title ?? row.originalFilename,
    status: row.status,
    durationSeconds: row.durationSeconds,
    coverUrl,
    isPublic: row.isPublic,
    language: row.language,
    lineCount: row.lyrics?.lines.length ?? 0,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Resolve our user id from a Clerk id without creating a row (read paths). */
async function lookupUserId(clerkId: string): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, clerkId))
    .limit(1);
  return user?.id ?? null;
}

/** The account that uploaded a song, labelled for public display. Null for
 *  anonymous uploads. */
async function uploaderFor(row: SongRow): Promise<Uploader | null> {
  if (!row.userId) return null;
  const [user] = await db
    .select({ displayName: users.displayName, email: users.email })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);
  if (!user) return null;
  const name =
    user.displayName?.trim() || (user.email ? user.email.split("@")[0] : null) || "A Syllary user";
  return { name };
}

/** All other public, ready tracks uploaded by the same account (for the "More
 *  from {uploader}" SEO row). Cover URLs are presigned locally (no network), so
 *  returning the full set is cheap; a high cap guards pathological libraries. */
async function moreFromUploaderFor(row: SongRow): Promise<PublicTrackItem[]> {
  if (!row.userId) return [];
  const rows = await db
    .select()
    .from(songs)
    .where(
      and(
        eq(songs.userId, row.userId),
        eq(songs.isPublic, true),
        eq(songs.status, "ready"),
        ne(songs.id, row.id),
      ),
    )
    .orderBy(desc(songs.createdAt))
    .limit(200);
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      title: r.title ?? r.originalFilename,
      durationSeconds: r.durationSeconds,
      coverUrl: r.coverImageKey ? await presignGet(r.coverImageKey) : null,
    })),
  );
}

async function ratingFor(songId: string, userId: string | null): Promise<RatingSummary> {
  const [agg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      avg: sql<number>`coalesce(avg(${ratings.stars}), 0)::float`,
    })
    .from(ratings)
    .where(eq(ratings.songId, songId));

  let myRating: number | null = null;
  if (userId) {
    const [mine] = await db
      .select({ stars: ratings.stars })
      .from(ratings)
      .where(and(eq(ratings.songId, songId), eq(ratings.userId, userId)))
      .limit(1);
    myRating = mine?.stars ?? null;
  }

  return {
    averageRating: Math.round((agg?.avg ?? 0) * 10) / 10,
    ratingCount: agg?.count ?? 0,
    myRating,
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

  // Stage 2 done: build and store lyrics + an AI "about this song" insight.
  const lyrics = await buildLyrics(prediction.output);
  const lastEnd = lyrics.lines.at(-1)?.end;
  const duration =
    row.durationSeconds ?? (typeof lastEnd === "number" ? Math.round(lastEnd) : null);
  const insights = await summarizeSong(lyrics.lines.map((l) => l.text));
  const [updated] = await db
    .update(songs)
    .set({
      status: "ready",
      stage: null,
      lyrics,
      insights,
      language: lyrics.language,
      durationSeconds: duration,
      updatedAt: new Date(),
    })
    .where(and(eq(songs.id, row.id), eq(songs.status, "processing"), eq(songs.stage, "transcribing")))
    .returning();

  // Funnel: record one "generated" event for the call that actually finalized
  // the song (the guarded UPDATE only matches once), with an approx cost.
  if (updated) {
    const cost = estimateGenerationCost(duration, lyrics);
    await recordEvent("generated", {
      ownerHash: updated.ownerHash,
      userId: updated.userId,
      props: { songId: updated.id, url: `${env.APP_URL}/s/${updated.id}`, durationSeconds: duration, ...cost },
    });
  }
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

    // Server-side check before any Replicate call (rule #2).
    const clerkId = await getAuthUserId(req);
    let authedUser: UserRow | null = null;
    const cost = creditCost(row.durationSeconds ?? 60);
    if (clerkId) {
      authedUser = await getOrCreateUser(clerkId);
      if (authedUser.credits < cost) {
        return reply.code(402).send({
          error: `Not enough tokens — this track costs ${cost}. Upgrade for more.`,
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

    // Charge tokens once transcription has started.
    if (authedUser) {
      await db
        .update(users)
        .set({
          credits: sql`GREATEST(${users.credits} - ${cost}, 0)`,
          songsLifetime: sql`${users.songsLifetime} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, authedUser.id));
    }

    return reply.send(await toSongDto(updated ?? row));
  });

  // Popular public songs (most recent ready public tracks).
  app.get("/songs/public", async (_req, reply) => {
    const rows = await db
      .select()
      .from(songs)
      .where(and(eq(songs.isPublic, true), eq(songs.status, "ready")))
      .orderBy(desc(songs.createdAt))
      .limit(12);
    return reply.send(await Promise.all(rows.map(toSongSummary)));
  });

  // Public, unauthenticated view of a song (powers shareable SEO pages). Only
  // public + ready songs are exposed. Includes the rating summary and, when the
  // request is authenticated, the caller's own rating.
  app.get<{ Params: { id: string } }>("/songs/:id/public", async (req, reply) => {
    const row = await getSongRow(req.params.id);
    if (!row || !row.isPublic || row.status !== "ready") {
      return reply.code(404).send({ error: "Not found." });
    }
    const clerkId = await getAuthUserId(req);
    const userId = clerkId ? await lookupUserId(clerkId) : null;
    const [audioUrl, coverUrl, rating, uploader, moreFromUploader] = await Promise.all([
      presignGet(row.r2Key),
      row.coverImageKey ? presignGet(row.coverImageKey) : Promise.resolve(null),
      ratingFor(row.id, userId),
      uploaderFor(row),
      moreFromUploaderFor(row),
    ]);
    const dto: PublicSong = {
      id: row.id,
      title: row.title ?? row.originalFilename,
      artist: row.artist,
      album: row.album,
      year: row.year,
      genre: row.genre,
      links: row.links ?? [],
      durationSeconds: row.durationSeconds,
      audioUrl,
      coverUrl,
      language: row.language,
      lyrics: row.lyrics ?? null,
      insights: row.insights ?? null,
      audioFeatures: row.audioFeatures ?? null,
      createdAt: row.createdAt.toISOString(),
      rating,
      uploader,
      moreFromUploader,
    };
    return reply.send(dto);
  });

  // Signed-in visitors can rate a public song (1-5 stars), one rating each.
  app.post<{ Params: { id: string } }>("/songs/:id/rating", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Sign in to rate this track." });
    const parsed = rateSongSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid rating." });
    const row = await getSongRow(req.params.id);
    if (!row || !row.isPublic || row.status !== "ready") {
      return reply.code(404).send({ error: "Not found." });
    }
    const user = await getOrCreateUser(clerkId);
    await db
      .insert(ratings)
      .values({ songId: row.id, userId: user.id, stars: parsed.data.stars })
      .onConflictDoUpdate({
        target: [ratings.songId, ratings.userId],
        set: { stars: parsed.data.stars, updatedAt: new Date() },
      });
    return reply.send(await ratingFor(row.id, user.id));
  });

  // The current user's library. Finalizes any in-flight songs (lazy poll) so the
  // library advances them even though it never opens the result page.
  app.get("/songs", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const rows = await db
      .select()
      .from(songs)
      .where(eq(songs.userId, user.id))
      .orderBy(desc(songs.createdAt));
    const finalized = await Promise.all(
      rows.map((r) => (r.status === "processing" ? finalizeIfDone(r) : Promise.resolve(r))),
    );
    return reply.send(await Promise.all(finalized.map(toSongSummary)));
  });

  app.patch<{ Params: { id: string } }>("/songs/:id", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const parsed = updateSongSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
    const row = await getSongRow(req.params.id);
    if (!row || row.userId !== user.id) return reply.code(404).send({ error: "Not found." });
    const [updated] = await db
      .update(songs)
      .set({
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.isPublic !== undefined ? { isPublic: parsed.data.isPublic } : {}),
        ...(parsed.data.artist !== undefined ? { artist: parsed.data.artist } : {}),
        ...(parsed.data.album !== undefined ? { album: parsed.data.album } : {}),
        ...(parsed.data.year !== undefined ? { year: parsed.data.year } : {}),
        ...(parsed.data.genre !== undefined ? { genre: parsed.data.genre } : {}),
        ...(parsed.data.links !== undefined ? { links: parsed.data.links } : {}),
        updatedAt: new Date(),
      })
      .where(eq(songs.id, row.id))
      .returning();
    return reply.send(await toSongDto(updated ?? row, true));
  });

  // Replace the lyrics with a user-edited version. Square-bracket lines in the
  // text become section labels; new lines are re-aligned onto the original word
  // timestamps so karaoke sync is preserved where words are unchanged.
  app.patch<{ Params: { id: string } }>("/songs/:id/lyrics", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const parsed = editLyricsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
    const row = await getSongRow(req.params.id);
    if (!row || row.userId !== user.id) return reply.code(404).send({ error: "Not found." });
    if (row.status !== "ready") {
      return reply.code(400).send({ error: "This track isn't ready to edit yet." });
    }

    const old = row.lyrics ?? { language: row.language, lines: [] };
    const lyrics = realignFromText(old, parseLyricsText(parsed.data.text));
    const [updated] = await db
      .update(songs)
      .set({ lyrics, updatedAt: new Date() })
      .where(eq(songs.id, row.id))
      .returning();
    return reply.send(await toSongDto(updated ?? row, true));
  });

  app.delete<{ Params: { id: string } }>("/songs/:id", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const row = await getSongRow(req.params.id);
    if (!row || row.userId !== user.id) return reply.code(404).send({ error: "Not found." });
    await deleteObject(row.r2Key);
    if (row.coverImageKey) await deleteObject(row.coverImageKey);
    await db.delete(songs).where(eq(songs.id, row.id));
    return reply.send({ ok: true });
  });

  app.get<{ Params: { id: string } }>("/songs/:id", async (req, reply) => {
    let row = await getSongRow(req.params.id);
    if (!row) return reply.code(404).send({ error: "Not found." });

    if (row.status === "processing") {
      row = await finalizeIfDone(row);
    }

    // Owner check (read-only) so the client can show edit affordances. This page
    // also serves public shares, so non-owners must not see them.
    let canEdit = false;
    const clerkId = await getAuthUserId(req);
    if (clerkId && row.userId) {
      canEdit = (await lookupUserId(clerkId)) === row.userId;
    }
    return reply.send(await toSongDto(row, canEdit));
  });
}
