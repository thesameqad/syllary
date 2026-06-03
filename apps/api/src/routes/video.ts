import type { FastifyInstance } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  type AspectRatio,
  type CreateVideoRequest,
  createVideoSchema,
  estimateVideoCost,
  type ImageQuality,
  type ImageSize,
  regenerateSegmentSchema,
  singleImageTokens,
  updateVideoJobSchema,
  type VideoJob,
  VIDEO_MODEL_INFO,
  VIDEO_MODELS,
  type VideoModel,
} from "@syllary/shared";
import { db } from "../db/client.js";
import { type SongRow, songs, users, videoJobs, type VideoJobRow } from "../db/schema.js";
import { getAuthUserId } from "../lib/clerk.js";
import { presignGet } from "../lib/r2.js";
import { getOrCreateUser } from "../lib/users.js";
import {
  finalizeVideoJob,
  regenerateSegmentImage,
  runVideoPipeline,
} from "../lib/video-pipeline.js";

// In-process pipeline dies on an API restart; if a processing job hasn't been
// touched in this long, a poll marks it failed and refunds (mirrors the song
// stale-claim rollback). Generous because the ffmpeg stitch is silent for a
// couple of minutes between the last image and "ready".
const VIDEO_STALE_MS = 20 * 60 * 1000;

async function toVideoJobDto(row: VideoJobRow): Promise<VideoJob> {
  const videoUrl =
    row.status === "ready" && row.videoKey ? await presignGet(row.videoKey) : null;
  // Per-line review cards (manual mode); empty for a fresh job. Presign each
  // image so the client can render it directly from R2.
  const segments = await Promise.all(
    (row.segments ?? []).map(async (s) => ({
      index: s.index,
      text: s.text,
      prompt: s.prompt,
      direction: s.direction ?? null,
      status: s.status,
      imageUrl: s.imageKey ? await presignGet(s.imageKey) : null,
    })),
  );
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
    isPreview: row.isPreview,
    totalSegments: row.totalSegments,
    completedSegments: row.completedSegments,
    segments,
    videoUrl,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

async function refund(job: VideoJobRow): Promise<void> {
  if (job.userId && job.tokensCharged > 0) {
    await db
      .update(users)
      .set({ credits: sql`${users.credits} + ${job.tokensCharged}`, updatedAt: new Date() })
      .where(eq(users.id, job.userId));
  }
}

/** Price, insert, charge, and fire a video job. Previews are forced to autopilot.
 *  Returns `{ insufficient, cost }` if the caller can't afford it, else `{ job }`.
 *  Shared by the create route and the preview→full promote route. */
async function startVideoJob(
  userId: string,
  userCredits: number,
  song: SongRow,
  settings: CreateVideoRequest,
): Promise<{ job?: VideoJobRow; cost: number; insufficient: boolean }> {
  const mode = settings.preview ? "autopilot" : settings.mode;
  const cost = estimateVideoCost({
    model: settings.model,
    quality: settings.imageQuality,
    imageSize: settings.imageSize,
    lyrics: song.lyrics,
    durationSeconds: song.durationSeconds,
    preview: settings.preview,
  }).tokens;
  if (userCredits < cost) return { cost, insufficient: true };

  const [job] = await db
    .insert(videoJobs)
    .values({
      songId: song.id,
      userId,
      status: "pending",
      mode,
      model: settings.model,
      styleDescription: settings.styleDescription,
      aspectRatio: settings.aspectRatio,
      imageSize: settings.imageSize,
      imageQuality: settings.imageQuality,
      isPreview: settings.preview,
      motionMode: settings.model === "fast" ? "ffmpeg" : "ai",
      tokensCharged: cost,
    })
    .returning();
  if (!job) return { cost, insufficient: false };

  // Charge up front; refunded by the pipeline / stale-poll on failure.
  await db
    .update(users)
    .set({ credits: sql`GREATEST(${users.credits} - ${cost}, 0)`, updatedAt: new Date() })
    .where(eq(users.id, userId));

  // Fire-and-forget — the client polls GET /video-jobs/:id for progress.
  void runVideoPipeline(job.id);
  return { job, cost, insufficient: false };
}

export async function videoRoutes(app: FastifyInstance) {
  // Kick off a lyric-video generation job for a ready song the caller owns.
  app.post<{ Params: { id: string } }>("/songs/:id/video", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Sign in to generate a video." });
    const user = await getOrCreateUser(clerkId);

    const parsed = createVideoSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
    const settings = parsed.data;

    if (!VIDEO_MODEL_INFO[settings.model].enabled) {
      return reply
        .code(400)
        .send({ error: `${VIDEO_MODEL_INFO[settings.model].label} model is coming soon.` });
    }

    const [song] = await db.select().from(songs).where(eq(songs.id, req.params.id)).limit(1);
    if (!song || song.userId !== user.id) return reply.code(404).send({ error: "Not found." });
    if (song.status !== "ready") {
      return reply.code(400).send({ error: "This track isn't ready yet." });
    }
    if (!song.lyrics || song.lyrics.lines.length === 0) {
      return reply.code(400).send({ error: "This track has no lyrics to render." });
    }

    const { job, cost, insufficient } = await startVideoJob(user.id, user.credits, song, settings);
    if (insufficient) {
      return reply.code(402).send({
        error: `Not enough tokens — ${settings.preview ? "a preview" : "a lyric video"} costs ${cost}. Upgrade for more.`,
      });
    }
    if (!job) return reply.code(500).send({ error: "Could not start the job." });

    return reply.send(await toVideoJobDto(job));
  });

  // Promote a preview to the full music video: reuse the preview's exact settings
  // and start a full autopilot render (replaces the preview in the tab on finish).
  app.post<{ Params: { id: string; model: string } }>(
    "/songs/:id/videos/:model/full",
    async (req, reply) => {
      const clerkId = await getAuthUserId(req);
      if (!clerkId) return reply.code(401).send({ error: "Sign in to generate a video." });
      const user = await getOrCreateUser(clerkId);

      const model = req.params.model;
      if (!(VIDEO_MODELS as readonly string[]).includes(model)) {
        return reply.code(400).send({ error: "Unknown style." });
      }

      const [song] = await db.select().from(songs).where(eq(songs.id, req.params.id)).limit(1);
      if (!song || song.userId !== user.id) return reply.code(404).send({ error: "Not found." });
      if (!song.lyrics || song.lyrics.lines.length === 0) {
        return reply.code(400).send({ error: "This track has no lyrics to render." });
      }

      // The most recent job for this song+style is the preview we're promoting.
      const [prev] = await db
        .select()
        .from(videoJobs)
        .where(and(eq(videoJobs.songId, song.id), eq(videoJobs.model, model as VideoModel)))
        .orderBy(desc(videoJobs.createdAt))
        .limit(1);
      if (!prev) return reply.code(404).send({ error: "Nothing to generate yet." });

      const { job, cost, insufficient } = await startVideoJob(user.id, user.credits, song, {
        styleDescription: prev.styleDescription,
        mode: "autopilot",
        model: prev.model,
        aspectRatio: prev.aspectRatio as AspectRatio,
        imageSize: prev.imageSize as ImageSize,
        imageQuality: prev.imageQuality as ImageQuality,
        preview: false,
      });
      if (insufficient) {
        return reply.code(402).send({
          error: `Not enough tokens — the full video costs ${cost}. Upgrade for more.`,
        });
      }
      if (!job) return reply.code(500).send({ error: "Could not start the job." });

      return reply.send(await toVideoJobDto(job));
    },
  );

  // Poll a video job. Owner-only. Times out stale processing jobs and refunds.
  app.get<{ Params: { id: string } }>("/video-jobs/:id", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);

    let [row] = await db.select().from(videoJobs).where(eq(videoJobs.id, req.params.id)).limit(1);
    if (!row || row.userId !== user.id) return reply.code(404).send({ error: "Not found." });

    if (row.status === "processing" && Date.now() - row.updatedAt.getTime() > VIDEO_STALE_MS) {
      const [failed] = await db
        .update(videoJobs)
        .set({ status: "failed", error: "Video generation timed out.", updatedAt: new Date() })
        .where(and(eq(videoJobs.id, row.id), eq(videoJobs.status, "processing")))
        .returning();
      if (failed) {
        await refund(failed);
        row = failed;
      }
    }

    return reply.send(await toVideoJobDto(row));
  });

  // Manual mode: regenerate one line's image (optionally with an edited prompt).
  // Owner-only; job must be awaiting review. Charges singleImageTokens on
  // success only.
  app.post<{ Params: { id: string; index: string } }>(
    "/video-jobs/:id/segments/:index/regenerate",
    async (req, reply) => {
      const clerkId = await getAuthUserId(req);
      if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
      const user = await getOrCreateUser(clerkId);

      const parsed = regenerateSegmentSchema.safeParse(req.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
      const index = Number(req.params.index);
      if (!Number.isInteger(index)) return reply.code(400).send({ error: "Invalid segment." });

      const [job] = await db
        .select()
        .from(videoJobs)
        .where(eq(videoJobs.id, req.params.id))
        .limit(1);
      if (!job || job.userId !== user.id) return reply.code(404).send({ error: "Not found." });
      if (job.status !== "review") {
        return reply.code(400).send({ error: "This video isn't open for editing." });
      }

      const cost = singleImageTokens(job.imageQuality as ImageQuality, job.imageSize as ImageSize);
      if (user.credits < cost) {
        return reply.code(402).send({
          error: `Not enough tokens — regenerating a scene costs ${cost}. Upgrade for more.`,
        });
      }

      let segment;
      try {
        segment = await regenerateSegmentImage(job, index, parsed.data.direction);
      } catch (err) {
        req.log.error({ err }, "regenerate-segment failed");
        return reply.code(502).send({ error: "Could not regenerate this scene. Try again." });
      }

      // Charge only after a successful regeneration.
      await db
        .update(users)
        .set({ credits: sql`GREATEST(${users.credits} - ${cost}, 0)`, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      return reply.send(segment);
    },
  );

  // Manual mode: edit the job-wide shared fields (art-direction style + the
  // song "context" art brief) that apply to every scene. Owner-only; job must be
  // awaiting review. Takes effect on the next (re)generate of each scene.
  app.patch<{ Params: { id: string } }>("/video-jobs/:id", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);

    const parsed = updateVideoJobSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });

    const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, req.params.id)).limit(1);
    if (!job || job.userId !== user.id) return reply.code(404).send({ error: "Not found." });
    if (job.status !== "review") {
      return reply.code(400).send({ error: "This video isn't open for editing." });
    }

    const [updated] = await db
      .update(videoJobs)
      .set({
        ...(parsed.data.styleDescription !== undefined
          ? { styleDescription: parsed.data.styleDescription }
          : {}),
        ...(parsed.data.sceneBrief !== undefined
          ? { sceneBrief: parsed.data.sceneBrief?.trim() || null }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(videoJobs.id, job.id))
      .returning();

    return reply.send(await toVideoJobDto(updated ?? job));
  });

  // Manual mode: assemble the final video from the approved per-line images.
  // Owner-only; job must be awaiting review. No extra charge (paid up front).
  app.post<{ Params: { id: string } }>("/video-jobs/:id/finalize", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);

    const [job] = await db
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.id, req.params.id))
      .limit(1);
    if (!job || job.userId !== user.id) return reply.code(404).send({ error: "Not found." });

    // Atomically claim the review job → processing, so the client immediately
    // shows the progress view and resumes polling (idempotent against a double
    // click). Then fire the assembly fire-and-forget.
    const [claimed] = await db
      .update(videoJobs)
      .set({ status: "processing", completedSegments: 0, updatedAt: new Date() })
      .where(and(eq(videoJobs.id, job.id), eq(videoJobs.status, "review")))
      .returning();
    if (!claimed) {
      return reply.code(409).send({ error: "This video is already being generated." });
    }

    void finalizeVideoJob(claimed.id);

    return reply.send(await toVideoJobDto(claimed));
  });
}
