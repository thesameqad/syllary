import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { and, desc, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import {
  type AspectRatio,
  canRemoveWatermark,
  coverCommitSchema,
  coverImageTokens,
  coverPresignSchema,
  creditCost,
  editLyricsSchema,
  generateCoverSchema,
  type GenerationMode,
  MAX_DURATION_SECONDS,
  normalizeCharacterRefs,
  parseLyricsText,
  type Plan,
  PLAN_CREDITS,
  processSongSchema,
  type PublicSong,
  type PublicTrackItem,
  type ImageQuality,
  type ImageSize,
  rateSongSchema,
  type RatingSummary,
  setPublicVideoSchema,
  type Song,
  type SongSummary,
  type SceneGrouping,
  type SongVideo,
  syncLyricsSchema,
  videoDownloadSchema,
  type VideoDownloadResolution,
  type VideoJob,
  type VideoModel,
  type Uploader,
  updateSongSchema,
} from "@syllary/shared";
import { db } from "../db/client.js";
import { env } from "../env.js";
import { ratings, songs, type SongRow, songVideos, users, type UserRow, videoJobs } from "../db/schema.js";
import { getAuthUserId } from "../lib/clerk.js";
import { deleteObject, objectSize, presignGet, presignPut, putObject } from "../lib/r2.js";
import {
  getPrediction,
  startSeparation,
  vocalsUrlFromOutput,
} from "../lib/replicate.js";
import { transcribeWithScribe } from "../lib/fal-stt.js";
import { buildLyricsFromScribe, realignFromText } from "../lib/transcript.js";
import { summarizeSong } from "../lib/openrouter.js";
import { generateCoverImage } from "../lib/cover-image.js";
import { matchStreamingLinks } from "../lib/music-links.js";
import { probeDurationSeconds, transcodeForDownload } from "../lib/ffmpeg.js";
import { Sentry } from "../instrument.js";
import { backfillVideoThumbs, reapStaleVideoJob, toReviewSegment } from "../lib/video-pipeline.js";
import { resolveArtistAlbum } from "../lib/catalog.js";
import { estimateGenerationCost, firstTouchLandingSlug, recordEvent } from "../lib/analytics.js";
import { sendOnce, songReadyEmail, tokenLowEmail, userForEmail } from "../lib/email.js";
import { captureServer } from "../lib/posthog.js";
import { getOrCreateUser } from "../lib/users.js";

const RES_HEIGHT: Record<VideoDownloadResolution, number> = { "1080p": 1080, "720p": 720, "480p": 480 };
// Cache keys currently being transcoded — dedupes concurrent/poll requests so we
// don't kick off the same encode twice (single API instance).
const downloadInFlight = new Set<string>();

/** Download the clean master, transcode to the requested variant (scale ±
 *  watermark), and upload it to the R2 cache key. */
async function produceDownloadVariant(
  videoKey: string,
  cacheKey: string,
  height: number,
  watermark: boolean,
): Promise<void> {
  const workDir = path.join(os.tmpdir(), `syllary-dl-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  try {
    // Phase timing → Render stdout, so a slow download is traceable: fetch = pull the
    // master from R2, transcode = the ffmpeg re-encode (the expensive part for any
    // watermarked/resized variant), upload = push the cached variant back to R2.
    const tFetch = Date.now();
    const res = await fetch(await presignGet(videoKey));
    if (!res.ok) throw new Error(`fetch master HTTP ${res.status}`);
    const master = Buffer.from(await res.arrayBuffer());
    await writeFile(path.join(workDir, "master.mp4"), master);
    const fetchMs = Date.now() - tFetch;

    const tEnc = Date.now();
    await transcodeForDownload({ workDir, inName: "master.mp4", outName: "out.mp4", height, watermark });
    const transcodeMs = Date.now() - tEnc;

    const tUp = Date.now();
    const out = await readFile(path.join(workDir, "out.mp4"));
    await putObject(cacheKey, out, "video/mp4");
    const uploadMs = Date.now() - tUp;

    console.log(
      `[download] ${height}p ${watermark ? "wm" : "clean"} masterMB=${(master.length / 1e6).toFixed(1)}` +
        ` outMB=${(out.length / 1e6).toFixed(1)} fetchMs=${fetchMs} transcodeMs=${transcodeMs} uploadMs=${uploadMs}`,
    );
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// Two Replicate steps (Demucs + WhisperX), so allow more headroom than one.
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

// Atomic-claim marker for the separating→transcribing transition. We encode
// the upstream demucs prediction ID so a crash mid-fal-call can be rolled
// back to "separating" with the same demucs ID intact, re-using the cached
// vocals stem (no need to pay for separation again).
const CLAIM_PREFIX = "claim:";
// Grace period before treating a claim as stale and rolling it back. fal.ai's
// Scribe is normally ~3-5s but can take longer on cold-boot or large audio,
// so we wait ~90s before assuming the call died.
const CLAIM_STALE_MS = 90 * 1000;

async function getSongRow(id: string): Promise<SongRow | undefined> {
  const [row] = await db.select().from(songs).where(eq(songs.id, id)).limit(1);
  return row;
}

/** All finished lyric videos for a song (one per style), with presigned URLs. */
async function videosFor(songId: string): Promise<SongVideo[]> {
  const rows = await db.select().from(songVideos).where(eq(songVideos.songId, songId));
  return Promise.all(
    rows.map(async (r) => ({
      model: r.model,
      url: await presignGet(r.videoKey),
      isPreview: r.isPreview,
      // The reuse-frames quote re-prices the SOURCE timeline, so the client must
      // know how that timeline was grouped.
      sceneGrouping: (r.sceneGrouping ?? "line") as SceneGrouping,
    })),
  );
}

/** The latest still-rendering lyric-video job for a song (so the result page
 *  can resume its in-progress tab after a reload), or null. */
async function activeVideoJobFor(songId: string): Promise<VideoJob | null> {
  let [row] = await db
    .select()
    .from(videoJobs)
    .where(
      and(
        eq(videoJobs.songId, songId),
        or(
          eq(videoJobs.status, "pending"),
          eq(videoJobs.status, "processing"),
          eq(videoJobs.status, "review"),
        ),
      ),
    )
    .orderBy(desc(videoJobs.createdAt))
    .limit(1);
  if (!row) return null;
  // Self-heal: a job whose in-process pipeline died on a restart would otherwise show
  // "Generating…" forever and block edits. Reap it (mark failed + refund) if stale;
  // an abandoned "review" draft is discarded outright (reap returns null) — either
  // way there's no active job to surface.
  const alive = await reapStaleVideoJob(row);
  if (!alive) return null;
  row = alive;
  if (row.status !== "pending" && row.status !== "processing" && row.status !== "review") {
    return null;
  }
  // Per-line cards so a manual job in "review" can resume after a reload.
  const segments = await Promise.all((row.segments ?? []).map(toReviewSegment));
  return {
    id: row.id,
    songId: row.songId,
    status: row.status,
    mode: row.mode,
    model: row.model,
    styleDescription: row.styleDescription,
    sceneBrief: row.sceneBrief ?? null,
    aspectRatio: row.aspectRatio as AspectRatio,
    imageSize: row.imageSize as ImageSize,
    imageQuality: row.imageQuality as ImageQuality,
    sceneGrouping: (row.sceneGrouping ?? "line") as SceneGrouping,
    prerenderImages: row.prerenderImages,
    isPreview: row.isPreview,
    isEdit: row.reuseFrames && row.mode === "manual",
    totalSegments: row.totalSegments,
    completedSegments: row.completedSegments,
    segments,
    characterNames: normalizeCharacterRefs(row.characterImageKeys)
      .map((c) => c.name)
      .filter((n) => n.trim().length > 0),
    videoUrl: null,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

/** R2 key of the song's chosen public lyric video, or null. Exported for the
 *  dashboard showcase (routes/showcase.ts). */
export async function publicVideoKeyFor(row: SongRow): Promise<string | null> {
  return (await publicVideoFor(row))?.videoKey ?? null;
}

/** The song's chosen public video row (key + captured thumbnail), or null. */
export async function publicVideoFor(
  row: SongRow,
): Promise<{ videoKey: string; thumbKey: string | null } | null> {
  if (!row.publicVideoModel) return null;
  const [v] = await db
    .select({ videoKey: songVideos.videoKey, thumbKey: songVideos.thumbKey })
    .from(songVideos)
    .where(and(eq(songVideos.songId, row.id), eq(songVideos.model, row.publicVideoModel)))
    .limit(1);
  return v ?? null;
}

/** Presigned URL of the song's chosen public lyric video, or null. */
async function publicVideoUrlFor(row: SongRow): Promise<string | null> {
  const key = await publicVideoKeyFor(row);
  return key ? presignGet(key) : null;
}

async function toSongDto(row: SongRow, canEdit = false): Promise<Song> {
  const audioUrl = row.status === "ready" ? await presignGet(row.r2Key) : null;
  const coverUrl = row.coverImageKey ? await presignGet(row.coverImageKey) : null;
  const videos = await videosFor(row.id);
  const activeVideoJob = await activeVideoJobFor(row.id);
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
    processingStartedAt: row.processingStartedAt ? row.processingStartedAt.toISOString() : null,
    mode: row.mode ?? null,
    videos,
    activeVideoJob,
    publicVideoModel: row.publicVideoModel ?? null,
    useCoverForVideoThumb: row.useCoverForVideoThumb,
    canEdit,
  };
}

async function toSongSummary(row: SongRow): Promise<SongSummary> {
  const coverUrl = row.coverImageKey ? await presignGet(row.coverImageKey) : null;
  // Music-video status for the library/dashboard cards.
  const vids = await db
    .select({ model: songVideos.model, updatedAt: songVideos.updatedAt, thumbKey: songVideos.thumbKey })
    .from(songVideos)
    .where(eq(songVideos.songId, row.id));
  const active = await activeVideoJobFor(row.id);
  // Video-card thumbnail when the owner opted out of the cover image: the most
  // recently rendered video that has a captured frame (null falls back to cover).
  const thumbKey = row.useCoverForVideoThumb
    ? null
    : (vids
        .filter((v) => v.thumbKey)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]?.thumbKey ?? null);
  const times = vids.map((v) => v.updatedAt.getTime());
  if (active) times.push(Date.parse(active.createdAt));
  return {
    id: row.id,
    title: row.title ?? row.originalFilename,
    artist: row.artist,
    album: row.album,
    artistId: row.artistId ?? null,
    albumId: row.albumId ?? null,
    status: row.status,
    stage: row.stage ?? null,
    durationSeconds: row.durationSeconds,
    coverUrl,
    isPublic: row.isPublic,
    language: row.language,
    lineCount: row.lyrics?.lines.length ?? 0,
    createdAt: row.createdAt.toISOString(),
    processingStartedAt: row.processingStartedAt ? row.processingStartedAt.toISOString() : null,
    mode: row.mode ?? null,
    videoModels: vids.map((v) => v.model),
    videoActive: active
      ? {
          id: active.id,
          status: active.status,
          model: active.model,
          completedSegments: active.completedSegments,
          totalSegments: active.totalSegments,
        }
      : null,
    videoLatestAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
    videoThumbUrl: thumbKey ? await presignGet(thumbKey) : null,
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
  // Guarded update fires once, so this can't double-count.
  if (row) {
    captureServer(row.ownerHash, "processing_failed", { song_id: row.id, error });
    // Page on hard pipeline failures (vocal isolation, transcription, timeout):
    // the pipeline runs in a background poll, so the global Fastify→Sentry
    // handler never sees these the way it sees a thrown request handler.
    Sentry.captureException(new Error(`Song processing failed: ${error}`), {
      level: "error",
      tags: { feature: "song_pipeline", stage: row.stage ?? "unknown" },
      extra: { songId: row.id, mode: row.mode, durationSeconds: row.durationSeconds, error },
    });
  }
  return row;
}

async function finalizeIfDone(row: SongRow): Promise<SongRow> {
  const predictionId = row.replicatePredictionId;
  if (!predictionId) return row;

  // Time out from when processing actually started, not from row creation —
  // a regenerated song's createdAt is the original upload time and would
  // wrongly trigger an immediate timeout.
  const startedAt = row.processingStartedAt ?? row.createdAt;
  if (Date.now() - startedAt.getTime() > PROCESSING_TIMEOUT_MS) {
    return (await markFailed(row.id, "Processing timed out.")) ?? row;
  }

  // Stage 1 (separating): poll the Demucs prediction.
  if (row.stage === "separating") {
    const prediction = await getPrediction(predictionId);
    if (prediction.status === "failed" || prediction.status === "canceled") {
      return (await markFailed(row.id, prediction.error ?? "Vocal isolation failed.")) ?? row;
    }
    if (prediction.status !== "succeeded") return row;

    const vocalsUrl = vocalsUrlFromOutput(prediction.output);
    if (!vocalsUrl) {
      return (await markFailed(row.id, "Vocal isolation produced no output.")) ?? row;
    }

    // Atomically claim the transcription step so only one concurrent poll
    // calls fal.ai. The marker encodes the demucs prediction ID so a crash
    // mid-call can be rolled back without losing the (still cached) demucs
    // output. fal.ai's Scribe is synchronous (~3-5s), so the entire
    // transcribe → buildLyrics → save path happens inside this one poll tick.
    const claimMarker = `${CLAIM_PREFIX}${predictionId}`;
    const [claimed] = await db
      .update(songs)
      .set({
        stage: "transcribing",
        replicatePredictionId: claimMarker,
        updatedAt: new Date(),
      })
      .where(and(eq(songs.id, row.id), eq(songs.status, "processing"), eq(songs.stage, "separating")))
      .returning();
    if (!claimed) {
      // Another poll won the claim — let it finish.
      return (await getSongRow(row.id)) ?? row;
    }

    let lyrics;
    try {
      const scribe = await transcribeWithScribe(vocalsUrl);
      lyrics = await buildLyricsFromScribe(scribe);
    } catch (err) {
      // Roll back the claim so the next poll can retry against the same
      // (cached, succeeded) demucs prediction.
      await db
        .update(songs)
        .set({ stage: "separating", replicatePredictionId: predictionId, updatedAt: new Date() })
        .where(and(eq(songs.id, row.id), eq(songs.replicatePredictionId, claimMarker)));
      throw err;
    }

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
        replicatePredictionId: null,
        updatedAt: new Date(),
      })
      .where(and(eq(songs.id, row.id), eq(songs.replicatePredictionId, claimMarker)))
      .returning();

    // Funnel event — fires once because the guarded UPDATE only matches once.
    if (updated) {
      const cost = estimateGenerationCost(duration, lyrics);
      // First-touch attribution: which SEO landing page this owner arrived from.
      const landingSlug = await firstTouchLandingSlug(updated.ownerHash);
      if (landingSlug) {
        await db
          .update(songs)
          .set({ acquisitionLandingSlug: landingSlug })
          .where(eq(songs.id, updated.id));
      }
      await recordEvent("generated", {
        ownerHash: updated.ownerHash,
        userId: updated.userId,
        props: {
          songId: updated.id,
          url: `${env.APP_URL}/s/${updated.id}`,
          durationSeconds: duration,
          ...(landingSlug ? { landingSlug } : {}),
          ...cost,
        },
      });
      captureServer(updated.ownerHash, "processing_completed", {
        song_id: updated.id,
        mode: updated.mode,
        duration_seconds: duration,
        raw_cost_usd: cost.totalCostUsd,
        ...(landingSlug ? { landing_slug: landingSlug } : {}),
      });
      // "Your song is ready" — recovers everyone who closed the tab during the
      // render. Deduped per song; fire-and-forget.
      if (updated.userId) {
        void userForEmail(updated.userId).then((u) => {
          if (u) return sendOnce(u, `song_ready:${updated.id}`, () => songReadyEmail(updated.id, updated.title ?? "Your song"));
        });
      }
    }
    return updated ?? (await getSongRow(row.id)) ?? row;
  }

  // Stage 2 (transcribing): a "claim:<demucsId>" marker means an earlier
  // poll started the fal.ai call and never wrote the result back (process
  // crashed, network died, etc.). After a grace period, roll the row back
  // to stage="separating" so the next poll re-runs transcription against
  // the same already-succeeded demucs prediction.
  if (predictionId.startsWith(CLAIM_PREFIX)) {
    const age = Date.now() - row.updatedAt.getTime();
    if (age < CLAIM_STALE_MS) return row;
    const demucsId = predictionId.slice(CLAIM_PREFIX.length);
    const [reset] = await db
      .update(songs)
      .set({ stage: "separating", replicatePredictionId: demucsId, updatedAt: new Date() })
      .where(and(eq(songs.id, row.id), eq(songs.replicatePredictionId, predictionId)))
      .returning();
    return reset ?? row;
  }

  // Any other predictionId shape here is a row that was mid-transcription
  // under the old WhisperX-poll architecture during the engine swap. Mark
  // failed so the user can re-upload; in-flight legacy state isn't worth the
  // backwards-compat complexity for a one-time deploy crossover.
  return (await markFailed(row.id, "In-flight job from a previous engine; please retry the upload.")) ?? row;
}

/** Surface an upload/processing failure as a detailed Sentry issue (these are
 *  deliberate 4xx responses, so the global Fastify→Sentry handler never sees them).
 *  Stable per-`stage` title so Sentry groups cleanly; the specific reason (ffmpeg
 *  stderr, HTTP status, etc.) and request context ride along as `extra`. */
function reportUploadFailure(stage: string, detail: string, ctx: Record<string, unknown>): void {
  console.error(`[upload-failure] ${stage}: ${detail}`, ctx);
  Sentry.captureException(new Error(`Audio upload failed: ${stage}`), {
    level: "error",
    tags: { feature: "audio_upload", stage },
    extra: { detail, ...ctx },
  });
}

export async function songsRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>("/songs/:id/process", async (req, reply) => {
    const row = await getSongRow(req.params.id);
    if (!row) return reply.code(404).send({ error: "Not found." });
    if (row.status !== "pending") return reply.send(await toSongDto(row));

    const size = await objectSize(row.r2Key);
    if (size === null) {
      reportUploadFailure("process:object-missing", "R2 HEAD returned no object for the uploaded key", {
        songId: row.id,
        r2Key: row.r2Key,
      });
      return reply.code(400).send({ error: "Upload not found. Please try again." });
    }

    const bodyParse = processSongSchema.safeParse(req.body ?? {});
    if (!bodyParse.success) {
      return reply.code(400).send({ error: "Invalid mode." });
    }
    const mode: GenerationMode = bodyParse.data.mode ?? "pro";

    // Tokens are priced per duration, so duration must be MEASURED server-side
    // (the presign-time value comes from the client and could be forged or
    // omitted — `?? 60` would make omission the cheapest attack).
    const audioUrl = await presignGet(row.r2Key);
    const { seconds: measured, detail } = await probeDurationSeconds(audioUrl);
    if (measured === null) {
      reportUploadFailure("process:probe", detail, {
        songId: row.id,
        r2Key: row.r2Key,
        sizeBytes: size,
        mode,
      });
      return reply.code(400).send({ error: "We couldn't read that audio file. Please re-upload it." });
    }
    const durationSeconds = Math.round(measured);

    // Server-side check before any Replicate call (rule #2).
    const clerkId = await getAuthUserId(req);
    let authedUser: UserRow | null = null;

    // The anonymous 3-minute cap, enforced against the measured value (the
    // presign check only sees the client-reported duration).
    if (!clerkId && durationSeconds > MAX_DURATION_SECONDS + 1) {
      return reply.code(400).send({ error: "Track is over 3 minutes. Sign up to remove the limit." });
    }

    const cost = creditCost(durationSeconds, mode);
    if (clerkId) {
      authedUser = await getOrCreateUser(clerkId);
      if (authedUser.credits < cost) {
        captureServer(`clerk:${clerkId}`, "paywall_viewed", {
          trigger: "tokens",
          wanted: "lyrics",
          cost_tokens: cost,
          balance: authedUser.credits,
        });
        return reply.code(402).send({
          error: `Not enough tokens — this track costs ${cost}. Upgrade for more.`,
        });
      }
    } else {
      // Anonymous: ANONYMOUS_DAILY_LIMIT transcription LIFETIME per IP+UA hash
      // (landing page promises "1 free song", not "1 per day"). Count any prior
      // row from this owner that has started processing — processingStartedAt
      // is set atomically when /process kicks the pipeline and never cleared,
      // so completed songs stay counted.
      const [usage] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(songs)
        .where(
          and(
            eq(songs.ownerHash, row.ownerHash),
            isNotNull(songs.processingStartedAt),
            ne(songs.id, row.id),
          ),
        );
      const prior = usage?.count ?? 0;
      req.log.info(
        { ownerHash: row.ownerHash, prior, limit: env.ANONYMOUS_DAILY_LIMIT },
        "anonymous-quota-check",
      );
      if (prior >= env.ANONYMOUS_DAILY_LIMIT) {
        return reply.code(429).send({
          error: `Free limit reached. Sign up free for ${PLAN_CREDITS.free} credits, or upgrade for more.`,
        });
      }
    }

    let predictionId: string;
    try {
      // Step 1: isolate vocals (Demucs); WhisperX runs on the stem in finalize.
      predictionId = await startSeparation(audioUrl, mode);
    } catch (err) {
      req.log.error(err);
      await db
        .update(songs)
        .set({ status: "failed", error: "Could not start processing.", updatedAt: new Date() })
        .where(eq(songs.id, row.id));
      return reply.code(502).send({ error: "Could not start processing." });
    }

    const startedAt = new Date();
    const [updated] = await db
      .update(songs)
      .set({
        status: "processing",
        stage: "separating",
        mode,
        durationSeconds,
        replicatePredictionId: predictionId,
        processingStartedAt: startedAt,
        updatedAt: startedAt,
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

    captureServer(row.ownerHash, "processing_started", {
      song_id: row.id,
      mode,
      duration_seconds: durationSeconds,
      cost_tokens: cost,
      authed: !!authedUser,
    });

    // Low-balance nudge once the wallet dips under ~one song's worth.
    if (authedUser) {
      const remaining = Math.max(0, authedUser.credits - cost);
      if (remaining < 600) {
        void sendOnce(authedUser, "token_low", () => tokenLowEmail(remaining), { marketing: true });
      }
    }

    return reply.send(await toSongDto(updated ?? row));
  });

  // Regenerate a previously-processed song with a different mode. Reuses the
  // existing R2 audio file (no re-upload) and the cover art. Charges credits
  // for the new mode and resets the lyrics/insights so the result page shows
  // the new transcript when polling completes.
  app.post<{ Params: { id: string } }>("/songs/:id/regenerate", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Sign in to regenerate." });
    const user = await getOrCreateUser(clerkId);

    const row = await getSongRow(req.params.id);
    if (!row || row.userId !== user.id) {
      return reply.code(404).send({ error: "Not found." });
    }
    if (row.status === "processing") {
      return reply.code(409).send({ error: "This track is already being processed." });
    }

    const bodyParse = processSongSchema.safeParse(req.body ?? {});
    if (!bodyParse.success || !bodyParse.data.mode) {
      return reply.code(400).send({ error: "A mode is required to regenerate." });
    }
    const mode: GenerationMode = bodyParse.data.mode;

    const size = await objectSize(row.r2Key);
    if (size === null) {
      reportUploadFailure("regenerate:object-missing", "R2 HEAD returned no object for the stored key", {
        songId: row.id,
        r2Key: row.r2Key,
      });
      return reply.code(400).send({ error: "Original upload no longer available." });
    }

    // Same trust rule as /process: price from the measured duration, never the
    // stored value (older rows may still carry a client-supplied number).
    const audioUrl = await presignGet(row.r2Key);
    const { seconds: measured, detail } = await probeDurationSeconds(audioUrl);
    if (measured === null) {
      reportUploadFailure("regenerate:probe", detail, {
        songId: row.id,
        r2Key: row.r2Key,
        sizeBytes: size,
        mode,
      });
      return reply.code(400).send({ error: "Original upload could not be read. Please re-upload." });
    }
    const durationSeconds = Math.round(measured);

    const cost = creditCost(durationSeconds, mode);
    if (user.credits < cost) {
      captureServer(`clerk:${clerkId}`, "paywall_viewed", {
        trigger: "tokens",
        wanted: "lyrics_regenerate",
        cost_tokens: cost,
        balance: user.credits,
      });
      return reply.code(402).send({
        error: `Not enough tokens — regenerating this track costs ${cost}. Upgrade for more.`,
      });
    }

    let predictionId: string;
    try {
      predictionId = await startSeparation(audioUrl, mode);
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({ error: "Could not start regeneration." });
    }

    const startedAt = new Date();
    const [updated] = await db
      .update(songs)
      .set({
        status: "processing",
        stage: "separating",
        mode,
        durationSeconds,
        replicatePredictionId: predictionId,
        processingStartedAt: startedAt,
        // Clear the previous run's output so the result page shows the new
        // processing state instead of the stale ready/failed view.
        lyrics: null,
        insights: null,
        error: null,
        updatedAt: startedAt,
      })
      .where(eq(songs.id, row.id))
      .returning();

    await db
      .update(users)
      .set({
        credits: sql`GREATEST(${users.credits} - ${cost}, 0)`,
        songsLifetime: sql`${users.songsLifetime} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    captureServer(row.ownerHash, "processing_started", {
      song_id: row.id,
      mode,
      duration_seconds: durationSeconds,
      cost_tokens: cost,
      authed: true,
      regenerate: true,
    });

    return reply.send(await toSongDto(updated ?? row, true));
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
    const [audioUrl, coverUrl, rating, uploader, moreFromUploader, lyricVideoUrl] = await Promise.all([
      presignGet(row.r2Key),
      row.coverImageKey ? presignGet(row.coverImageKey) : Promise.resolve(null),
      ratingFor(row.id, userId),
      uploaderFor(row),
      moreFromUploaderFor(row),
      publicVideoUrlFor(row),
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
      lyricVideoUrl,
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
    // Finalize in-flight songs lazily, but never let one failing finalize (a
    // transient Replicate/fal error during transcription) 500 the whole list —
    // that was leaving the Library/Recent page stuck on "Loading…". A failed
    // finalize just returns the row as-is (still processing); the next poll retries.
    const finalized = await Promise.all(
      rows.map((r) =>
        r.status === "processing"
          ? finalizeIfDone(r).catch((err) => {
              req.log.warn({ err, songId: r.id }, "finalizeIfDone failed (lazy, list)");
              return r;
            })
          : Promise.resolve(r),
      ),
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

    // When the artist/album strings change, re-resolve the entity FKs (find-or-
    // create) so the organized Library stays in sync with the edited metadata.
    let entityIds: { artistId: string | null; albumId: string | null } | null = null;
    if (parsed.data.artist !== undefined || parsed.data.album !== undefined) {
      const effArtist = parsed.data.artist !== undefined ? parsed.data.artist : row.artist;
      const effAlbum = parsed.data.album !== undefined ? parsed.data.album : row.album;
      entityIds = await resolveArtistAlbum(user.id, effArtist, effAlbum);
    }

    const [updated] = await db
      .update(songs)
      .set({
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.isPublic !== undefined ? { isPublic: parsed.data.isPublic } : {}),
        ...(parsed.data.artist !== undefined ? { artist: parsed.data.artist } : {}),
        ...(parsed.data.album !== undefined ? { album: parsed.data.album } : {}),
        ...(entityIds ? { artistId: entityIds.artistId, albumId: entityIds.albumId } : {}),
        ...(parsed.data.year !== undefined ? { year: parsed.data.year } : {}),
        ...(parsed.data.genre !== undefined ? { genre: parsed.data.genre } : {}),
        ...(parsed.data.links !== undefined ? { links: parsed.data.links } : {}),
        ...(parsed.data.useCoverForVideoThumb !== undefined
          ? { useCoverForVideoThumb: parsed.data.useCoverForVideoThumb }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(songs.id, row.id))
      .returning();
    // Switching to frame-based thumbnails: capture frames for videos rendered
    // before thumbnails existed (new renders get theirs at finalize). Fire-and-
    // forget — the cards fall back to the cover until each frame lands.
    if (parsed.data.useCoverForVideoThumb === false && row.useCoverForVideoThumb) {
      backfillVideoThumbs(row.id).catch((err) =>
        req.log.warn({ err, songId: row.id }, "video thumb backfill failed"),
      );
    }
    return reply.send(await toSongDto(updated ?? row, true));
  });

  // Distinct artist/album values from the caller's OTHER songs, for autosuggest
  // in the public-details editor. (Static path — declared before any /songs/:id.)
  app.get("/songs/meta-suggestions", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const [artistRows, albumRows] = await Promise.all([
      db
        .selectDistinct({ v: songs.artist })
        .from(songs)
        .where(and(eq(songs.userId, user.id), isNotNull(songs.artist)))
        .limit(200),
      db
        .selectDistinct({ v: songs.album })
        .from(songs)
        .where(and(eq(songs.userId, user.id), isNotNull(songs.album)))
        .limit(200),
    ]);
    const clean = (rows: { v: string | null }[]) =>
      Array.from(new Set(rows.map((r) => (r.v ?? "").trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 50);
    return reply.send({ artists: clean(artistRows), albums: clean(albumRows) });
  });

  // Replace the cover image — presign a direct-to-R2 PUT (owner-only). A fresh
  // key per upload busts any cached presigned GET of the old image.
  app.post<{ Params: { id: string } }>("/songs/:id/cover/presign", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const parsed = coverPresignSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Unsupported image type." });
    const row = await getSongRow(req.params.id);
    if (!row || row.userId !== user.id) return reply.code(404).send({ error: "Not found." });
    const key = `covers/${row.id}-${randomUUID()}`;
    const uploadUrl = await presignPut(key, parsed.data.contentType);
    return reply.send({ uploadUrl, key });
  });

  // Commit a freshly-uploaded cover: verify it belongs to this song + exists,
  // point the song at it, and drop the previous cover (best-effort).
  app.post<{ Params: { id: string } }>("/songs/:id/cover", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const parsed = coverCommitSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
    const row = await getSongRow(req.params.id);
    if (!row || row.userId !== user.id) return reply.code(404).send({ error: "Not found." });

    const { key } = parsed.data;
    if (!key.startsWith(`covers/${row.id}-`)) {
      return reply.code(400).send({ error: "Invalid cover key." });
    }
    const size = await objectSize(key);
    if (size === null) return reply.code(400).send({ error: "Upload not found — please retry." });
    if (size > 8 * 1024 * 1024) return reply.code(400).send({ error: "Image is too large (max 8MB)." });

    const oldKey = row.coverImageKey;
    const [updated] = await db
      .update(songs)
      .set({ coverImageKey: key, updatedAt: new Date() })
      .where(eq(songs.id, row.id))
      .returning();
    if (oldKey && oldKey !== key && oldKey.startsWith(`covers/${row.id}`)) {
      await deleteObject(oldKey);
    }
    return reply.send(await toSongDto(updated ?? row, true));
  });

  // AI-generate a cover image from a text description. Produces a square image,
  // stores it under a fresh covers/ key (NOT yet attached to the song), charges
  // credits (3× our OpenRouter cost), and returns the key + a presigned preview
  // URL. The client can then preview, regenerate (another call), save it via
  // POST /songs/:id/cover, or discard it. Charged only on success.
  app.post<{ Params: { id: string } }>("/songs/:id/cover/generate", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const parsed = generateCoverSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Describe the image you want." });
    const row = await getSongRow(req.params.id);
    if (!row || row.userId !== user.id) return reply.code(404).send({ error: "Not found." });

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
      req.log.error({ err }, "cover-generate failed");
      return reply.code(502).send({ error: "Couldn't generate the cover. Try again." });
    }

    const key = `covers/${row.id}-${randomUUID()}`;
    try {
      await putObject(key, image.buffer, image.contentType);
    } catch (err) {
      req.log.error({ err }, "cover-generate upload failed");
      return reply.code(502).send({ error: "Couldn't store the generated cover. Try again." });
    }

    // Charge only after a successful generation + upload.
    await db
      .update(users)
      .set({ credits: sql`GREATEST(${users.credits} - ${cost}, 0)`, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    return reply.send({ key, url: await presignGet(key) });
  });

  // Auto-match a track's streaming links from its title + artist (iTunes search
  // → Odesli fan-out). Read-only helper for the public-details editor; returns
  // an empty match (never errors) when nothing is found.
  app.get("/links/match", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const q = req.query as { title?: string; artist?: string; url?: string };
    const title = (q.title ?? "").toString();
    const artist = (q.artist ?? "").toString();
    const url = (q.url ?? "").toString();
    if (!title.trim() && !artist.trim() && !url.trim()) {
      return reply.code(400).send({ error: "Enter a song name, artist, or a streaming link." });
    }
    return reply.send(await matchStreamingLinks({ title, artist, url }));
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

  // Overwrite lyrics with hand-corrected word timestamps from the fine-tune
  // timing editor. Skips text-realignment — the client owns the data here.
  app.patch<{ Params: { id: string } }>("/songs/:id/sync", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const parsed = syncLyricsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
    const row = await getSongRow(req.params.id);
    if (!row || row.userId !== user.id) return reply.code(404).send({ error: "Not found." });
    if (row.status !== "ready") {
      return reply.code(400).send({ error: "This track isn't ready to edit yet." });
    }

    const [updated] = await db
      .update(songs)
      .set({ lyrics: parsed.data.lyrics, updatedAt: new Date() })
      .where(eq(songs.id, row.id))
      .returning();
    return reply.send(await toSongDto(updated ?? row, true));
  });

  // Choose which generated lyric-video style is shown on the public page (or
  // null to make none public). Only one style can be public at a time.
  app.patch<{ Params: { id: string } }>("/songs/:id/public-video", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const parsed = setPublicVideoSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
    const row = await getSongRow(req.params.id);
    if (!row || row.userId !== user.id) return reply.code(404).send({ error: "Not found." });

    const model = parsed.data.model;
    if (model) {
      const [v] = await db
        .select({ id: songVideos.id })
        .from(songVideos)
        .where(and(eq(songVideos.songId, row.id), eq(songVideos.model, model)))
        .limit(1);
      if (!v) {
        return reply.code(400).send({ error: "That video style hasn't been generated yet." });
      }
    }
    const [updated] = await db
      .update(songs)
      .set({ publicVideoModel: model, updatedAt: new Date() })
      .where(eq(songs.id, row.id))
      .returning();
    return reply.send(await toSongDto(updated ?? row, true));
  });

  // Delete a generated lyric video for one style. Removes the saved video + its
  // R2 object and unpublishes it if it was the public one. Frames/job history are
  // left intact (frames may be reused by other styles). Owner-only.
  app.delete<{ Params: { id: string; model: string } }>(
    "/songs/:id/videos/:model",
    async (req, reply) => {
      const clerkId = await getAuthUserId(req);
      if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
      const user = await getOrCreateUser(clerkId);
      const row = await getSongRow(req.params.id);
      if (!row || row.userId !== user.id) return reply.code(404).send({ error: "Not found." });

      const model = req.params.model as VideoModel;
      const [v] = await db
        .select({ videoKey: songVideos.videoKey })
        .from(songVideos)
        .where(and(eq(songVideos.songId, row.id), eq(songVideos.model, model)))
        .limit(1);
      if (!v) return reply.code(404).send({ error: "No video for that style." });

      await deleteObject(v.videoKey);
      await db
        .delete(songVideos)
        .where(and(eq(songVideos.songId, row.id), eq(songVideos.model, model)));

      let updatedRow = row;
      if (row.publicVideoModel === model) {
        const [u] = await db
          .update(songs)
          .set({ publicVideoModel: null, updatedAt: new Date() })
          .where(eq(songs.id, row.id))
          .returning();
        updatedRow = u ?? row;
      }
      return reply.send(await toSongDto(updatedRow, true));
    },
  );

  // On-demand download: produce a (resolution × watermark) variant from the stored
  // (clean) master, cache it in R2, and return a presigned URL. Removing the
  // watermark is gated to Music-video plans; the watermark is baked here on demand.
  // Async: the client polls this same endpoint until status === "ready".
  app.post<{ Params: { id: string; model: string } }>(
    "/songs/:id/videos/:model/download",
    async (req, reply) => {
      const clerkId = await getAuthUserId(req);
      if (!clerkId) return reply.code(401).send({ error: "Sign in to download." });
      const user = await getOrCreateUser(clerkId);
      const row = await getSongRow(req.params.id);
      if (!row || row.userId !== user.id) return reply.code(404).send({ error: "Not found." });
      const parsed = videoDownloadSchema.safeParse(req.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
      const { resolution, watermark } = parsed.data;
      if (!watermark && !canRemoveWatermark(user.plan as Plan)) {
        return reply.code(403).send({ error: "Removing the watermark needs a Music-video plan." });
      }
      const model = req.params.model as VideoModel;
      const [v] = await db
        .select({ videoKey: songVideos.videoKey })
        .from(songVideos)
        .where(and(eq(songVideos.songId, row.id), eq(songVideos.model, model)))
        .limit(1);
      if (!v) return reply.code(404).send({ error: "No video for that style." });

      // The stored video is the clean master. Clean at native resolution = serve it
      // directly (no transcode). Everything else is derived + cached.
      if (!watermark && resolution === "1080p") {
        captureServer(`clerk:${clerkId}`, "video_downloaded", {
          song_id: row.id, style: model, resolution, watermarked: false,
        });
        return reply.send({ status: "ready", url: await presignGet(v.videoKey) });
      }
      const dir = v.videoKey.replace(/\/[^/]+$/, "");
      // `v3` busts cached variants baked with the prior watermark (logo-only,
      // no domain text) — the current asset is the syllary.com lockup.
      const cacheKey = `${dir}/dl/v3-${resolution}-${watermark ? "wm" : "clean"}.mp4`;
      if ((await objectSize(cacheKey)) !== null) {
        captureServer(`clerk:${clerkId}`, "video_downloaded", {
          song_id: row.id, style: model, resolution, watermarked: watermark,
        });
        return reply.send({ status: "ready", url: await presignGet(cacheKey) });
      }
      if (!downloadInFlight.has(cacheKey)) {
        downloadInFlight.add(cacheKey);
        void produceDownloadVariant(v.videoKey, cacheKey, RES_HEIGHT[resolution], watermark)
          .catch((err) => req.log.error({ err }, "download transcode failed"))
          .finally(() => downloadInFlight.delete(cacheKey));
      }
      return reply.send({ status: "processing", url: null });
    },
  );

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
