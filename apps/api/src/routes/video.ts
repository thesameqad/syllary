import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  type AspectRatio,
  type CharacterReference,
  type CreateVideoRequest,
  createSegmentGroupSchema,
  createVideoSchema,
  estimateVideoCost,
  type ImageQuality,
  type ImageSize,
  normalizeCharacterRefs,
  referenceCountFor,
  moveSegmentLineSchema,
  regenerateClipSchema,
  regenerateSegmentSchema,
  reRenderTokens,
  type SceneGrouping,
  singleClipTokens,
  singleImageTokens,
  singlePlateTokens,
  updateSegmentGroupSchema,
  updateSegmentSchema,
  updateVideoJobSchema,
  type VideoJob,
  VIDEO_MODEL_INFO,
  VIDEO_MODELS,
  type VideoModel,
  type VideoSegment,
} from "@syllary/shared";
import { db } from "../db/client.js";
import {
  bandMembers,
  songElements,
  type SongRow,
  songs,
  users,
  videoJobs,
  type VideoJobRow,
} from "../db/schema.js";
import { getAuthUserId } from "../lib/clerk.js";
import { captureServer } from "../lib/posthog.js";
import { presignGet } from "../lib/r2.js";
import { getOrCreateUser } from "../lib/users.js";
import { videoArtBrief } from "../lib/openrouter.js";
import { PLATES_QUEUE_BUSY } from "../lib/plates.js";
import {
  discardReviewVideoJob,
  finalizeVideoJob,
  patchJobSegments,
  reapStaleVideoJob,
  regenerateSegmentClip,
  regenerateSegmentPlates,
  regenerateSegmentImage,
  runVideoPipeline,
  toReviewSegment,
} from "../lib/video-pipeline.js";

async function toVideoJobDto(row: VideoJobRow, opts: { scenes?: boolean } = {}): Promise<VideoJob> {
  const videoUrl =
    row.status === "ready" && row.videoKey ? await presignGet(row.videoKey) : null;
  // Per-line review cards (manual mode); empty for a fresh job. Presigns the frame
  // + motion clip for each scene (single source of truth in the pipeline).
  // Per-scene cards are only rendered in manual review. Presigning every frame on
  // every status poll (a long render is polled every ~2s) is pure wasted CPU that
  // steals cores from the ffmpeg stitch — so only do it when the job is in review.
  // The full-page Video Editor opts in (?scenes=1) to ALSO get them while a manual
  // job is still generating — its live "scenes developing" view needs them, and
  // that page polls at a gentler 3s.
  const includeScenes =
    row.status === "review" || (opts.scenes === true && row.mode === "manual");
  const segments = includeScenes
    ? await Promise.all((row.segments ?? []).map(toReviewSegment))
    : [];
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
    isPreview: row.isPreview,
    // A manual job seeded from a finished video's frames = a re-edit (reopened
    // into review to swap scenes + re-render), not a first-time manual render.
    isEdit: row.reuseFrames && row.mode === "manual",
    // The editor needs this to compute the TRUE finalize cost (no-prerender jobs
    // pay for blank images + clips at finalize; prerendered jobs already paid).
    prerenderImages: row.prerenderImages,
    totalSegments: row.totalSegments,
    completedSegments: row.completedSegments,
    segments,
    characterNames: normalizeCharacterRefs(row.characterImageKeys)
      .map((c) => c.name)
      .filter((n) => n.trim().length > 0),
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

/** Distribute reference image keys across selected subjects (band members +
 *  per-song elements) round-robin, capped at CHARACTER_REFS_PER_FRAME total (every
 *  subject gets one before any gets a second), with `perSubject` = 3 for a single
 *  subject else 2. Returns name-labeled CharacterReference groups, or null. */
function distributeReferences(
  subjects: { name: string; keys: string[] }[],
): CharacterReference[] | null {
  const ordered = subjects.filter((s) => s.keys.length > 0);
  if (ordered.length === 0) return null;
  const total = referenceCountFor(ordered.map((s) => s.keys.length));
  const perSubject = ordered.length === 1 ? 3 : 2;
  const groups: CharacterReference[] = ordered.map((s) => ({ name: s.name, imageKeys: [] }));
  let used = 0;
  for (let round = 0; round < perSubject && used < total; round++) {
    for (let i = 0; i < ordered.length && used < total; i++) {
      const key = ordered[i]?.keys[round];
      if (key) {
        groups[i]!.imageKeys.push(key);
        used++;
      }
    }
  }
  const nonEmpty = groups.filter((g) => g.imageKeys.length > 0);
  return nonEmpty.length > 0 ? nonEmpty : null;
}

/** Load selected band members as reference subjects (name + all their photo keys),
 *  in selection order, dropping ids not owned / with no photos. */
async function loadMemberSubjects(
  userId: string,
  characterIds?: string[],
): Promise<{ name: string; keys: string[] }[]> {
  if (!characterIds || characterIds.length === 0) return [];
  const rows = await db
    .select({ id: bandMembers.id, name: bandMembers.name, images: bandMembers.images })
    .from(bandMembers)
    .where(and(eq(bandMembers.userId, userId), inArray(bandMembers.id, characterIds)));
  const byId = new Map(rows.map((r) => [r.id, { name: r.name, images: r.images ?? [] }]));
  const out: { name: string; keys: string[] }[] = [];
  for (const id of characterIds) {
    const m = byId.get(id);
    if (m && m.images.length > 0) out.push({ name: m.name, keys: m.images.map((i) => i.key) });
  }
  return out;
}

/** Load the song's selected elements as reference subjects (name + its single image
 *  key), in selection order, dropping ids not owned / without an image. */
async function loadElementSubjects(
  userId: string,
  songId: string,
  elementIds?: string[],
): Promise<{ name: string; keys: string[] }[]> {
  if (!elementIds || elementIds.length === 0) return [];
  const rows = await db
    .select({ id: songElements.id, name: songElements.name, imageKey: songElements.imageKey })
    .from(songElements)
    .where(
      and(
        eq(songElements.userId, userId),
        eq(songElements.songId, songId),
        inArray(songElements.id, elementIds),
      ),
    );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: { name: string; keys: string[] }[] = [];
  for (const id of elementIds) {
    const e = byId.get(id);
    if (e && e.imageKey) out.push({ name: e.name, keys: [e.imageKey] });
  }
  return out;
}

/** Resolve selected band-member ids + the song's selected element ids into one
 *  name-labeled reference set, sharing the CHARACTER_REFS_PER_FRAME budget. Members
 *  come first (each with their uploaded photos), then elements (each with its single
 *  AI-generated reference image). Selection order preserved; owner-scoped; null when
 *  nothing usable. Generalizes the former resolveCharacterRefs. */
async function resolveReferenceSubjects(
  userId: string,
  songId: string,
  characterIds?: string[],
  elementIds?: string[],
): Promise<CharacterReference[] | null> {
  return distributeReferences([
    ...(await loadMemberSubjects(userId, characterIds)),
    ...(await loadElementSubjects(userId, songId, elementIds)),
  ]);
}

/** Price, insert, charge, and fire a video job. Previews are forced to autopilot.
 *  Returns `{ insufficient, cost }` if the caller can't afford it, else `{ job }`.
 *  Shared by the create route and the preview→full promote route. */
async function startVideoJob(
  userId: string,
  userCredits: number,
  song: SongRow,
  settings: CreateVideoRequest,
  /** Seed the job with another style's already-generated frames (imageKeys). The
   *  pipeline then skips the segment rebuild + image generation (autopilot only),
   *  and the image term is dropped from the cost. */
  reuse?: { segments: VideoSegment[] },
  /** Use these resolved character references directly (preview→full promote
   *  carries them from the source job) instead of resolving from settings.characterIds. */
  charactersOverride?: CharacterReference[] | null,
  /** Override the persisted motionMode (e.g. "ai_permissive" to make a Cinematic
   *  retry use the more permissive Grok model instead of Seedance). */
  motionModeOverride?: string,
): Promise<{ job?: VideoJobRow; cost: number; insufficient: boolean }> {
  // Previews are always autopilot; otherwise honor the requested mode (reuse jobs
  // may now be manual too — they stop at review with the reused frames).
  const mode = settings.preview ? "autopilot" : settings.mode;
  // Member references: an explicit override wins (preview→full + reuse carry the
  // source's members so reused videos stay editable), else resolve from the picked
  // band members. Elements are mention-driven (resolved per frame), not stored here.
  const characterImageKeys =
    charactersOverride !== undefined
      ? charactersOverride
      : reuse
        ? null
        : await resolveReferenceSubjects(userId, song.id, settings.characterIds);
  // Deferred-cost jobs charge nothing up front: no-prerender manual (each image is
  // paid per scene + at finalize) and reuse-manual (clips charged at finalize).
  const deferredCost =
    mode === "manual" && !settings.preview && (!!reuse || !settings.prerenderImages);
  const cost = deferredCost
    ? 0
    : estimateVideoCost({
        model: settings.model,
        quality: settings.imageQuality,
        imageSize: settings.imageSize,
        lyrics: song.lyrics,
        durationSeconds: song.durationSeconds,
        preview: settings.preview,
        reuseImages: !!reuse,
        sceneGrouping: settings.sceneGrouping,
        // Reuse prices the SOURCE's exact persisted timeline (its grouping may
        // differ from any re-plan; quote must equal charge).
        segments: reuse?.segments,
        // Cost scales with total reference IMAGES per frame (sum across members).
        referenceImages: characterImageKeys?.reduce((n, c) => n + c.imageKeys.length, 0) ?? 0,
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
      // User-confirmed art brief. undefined → null (the pipeline auto-derives one);
      // "" → "" (the user chose "no context" — never overridden); text → as-is.
      sceneBrief: settings.sceneBrief === undefined ? null : settings.sceneBrief.trim(),
      aspectRatio: settings.aspectRatio,
      sceneGrouping: settings.sceneGrouping,
      // Previews are pinned to 1K and Pro is downgraded to fast so the flat
      // preview price stays above our COGS; full renders keep the user's choice.
      // "lite" is KEPT on previews — it's cheaper than fast AND the promote-to-
      // full route inherits prev.imageQuality, so forcing "fast" here would make
      // a Lite preview promote (and charge!) at Medium prices.
      imageSize: !reuse && settings.preview ? "1K" : settings.imageSize,
      imageQuality:
        !reuse && settings.preview && settings.imageQuality === "pro"
          ? "fast"
          : settings.imageQuality,
      isPreview: reuse ? false : settings.preview,
      reuseFrames: !!reuse,
      segments: reuse?.segments ?? null,
      characterImageKeys: characterImageKeys ?? null,
      // Selected per-song elements (customized cast members + objects). The pipeline
      // restricts the @mention-resolvable catalog to this set; null = whole catalog.
      elementIds: settings.elementIds ?? null,
      prerenderImages: settings.prerenderImages,
      motionMode: motionModeOverride ?? (settings.model === "fast" ? "ffmpeg" : "ai"),
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

    // Lite tier: paid plans only (free users never see it in the UI — the
    // signup funnel is unchanged — but never trust the client), no Cinematic,
    // and no cast members (Qwen-Image takes no reference photos).
    if (settings.imageQuality === "lite") {
      if (user.plan === "free") {
        return reply.code(403).send({ error: "The Lite model is available on paid plans." });
      }
      if (settings.model === "pro") {
        return reply.code(400).send({ error: "Cinematic isn't available on the Lite model." });
      }
      if (settings.characterIds?.length || settings.elementIds?.length) {
        return reply.code(400).send({ error: "Cast members aren't available on the Lite model." });
      }
    }

    // "One scene" grouping = one looping clip + typography plates for every
    // line — the plates machinery only exists on Living Scenes.
    if (settings.sceneGrouping === "single" && settings.model !== "normal") {
      return reply
        .code(400)
        .send({ error: "One scene grouping needs the Living Scenes video style." });
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
      captureServer(`clerk:${clerkId}`, "paywall_viewed", {
        trigger: "tokens",
        wanted: settings.preview ? "video_preview" : "video_full",
        style: settings.model,
        cost_tokens: cost,
      });
      return reply.code(402).send({
        error: `Not enough tokens — ${settings.preview ? "a preview" : "a lyric video"} costs ${cost}. Upgrade for more.`,
      });
    }
    if (!job) return reply.code(500).send({ error: "Could not start the job." });

    captureServer(`clerk:${clerkId}`, settings.preview ? "video_preview_started" : "video_full_started", {
      song_id: song.id,
      style: settings.model,
      cost_tokens: cost,
      image_quality: settings.imageQuality,
    });

    return reply.send(await toVideoJobDto(job));
  });

  // The AI "art brief" (what the song is about) for the chosen style — shown in
  // the generate modal so the user can confirm/override the video's direction
  // before generating. Owner-only. Falls back to the song summary, then "".
  app.post<{ Params: { id: string } }>("/songs/:id/video/brief", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);
    const [song] = await db.select().from(songs).where(eq(songs.id, req.params.id)).limit(1);
    if (!song || song.userId !== user.id) return reply.code(404).send({ error: "Not found." });
    const body = (req.body ?? {}) as { style?: unknown };
    const style = typeof body.style === "string" ? body.style : "";
    const lines = song.lyrics?.lines.map((l) => l.text) ?? [];
    let brief = "";
    try {
      brief = await videoArtBrief(lines, style);
    } catch {
      brief = "";
    }
    return reply.send({ brief: brief || song.insights?.summary || "" });
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
      // Retry Cinematic with the more permissive Grok model (when Seedance
      // rejected the frames). Only meaningful for the pro/Cinematic style.
      const body = (req.body ?? {}) as { permissive?: unknown };
      const permissive = body.permissive === true && model === "pro";

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

      // A Lite preview can only be promoted while the plan is still paid (the
      // preview was gated at creation, but the subscription may have lapsed).
      if (prev.imageQuality === "lite" && user.plan === "free") {
        return reply.code(403).send({ error: "The Lite model is available on paid plans." });
      }

      // If the source job reused another style's frames, keep reusing them on the
      // retry (re-seed its segments) so we don't regenerate images — only the
      // motion step re-runs. Drop the stored clips so the motion actually re-runs
      // (same style, so the motion directions stay). Otherwise it's a normal full render.
      const reuseSeed =
        prev.reuseFrames && prev.segments && prev.segments.length > 0
          ? {
              segments: prev.segments.map((s) => ({
                ...s,
                status: "pending" as const,
                clipKey: null,
                clipStatus: "none" as const,
              })),
            }
          : undefined;

      const { job, cost, insufficient } = await startVideoJob(
        user.id,
        user.credits,
        song,
        {
          styleDescription: prev.styleDescription,
          sceneBrief: prev.sceneBrief ?? undefined,
          mode: "autopilot",
          model: prev.model,
          aspectRatio: prev.aspectRatio as AspectRatio,
          imageSize: prev.imageSize as ImageSize,
          imageQuality: prev.imageQuality as ImageQuality,
          sceneGrouping: (prev.sceneGrouping ?? "line") as SceneGrouping,
          preview: false,
          prerenderImages: true,
          elementIds: prev.elementIds ?? undefined, // carry the selected elements
        },
        reuseSeed,
        prev.characterImageKeys, // carry the source's characters into the render
        permissive ? "ai_permissive" : undefined,
      );
      if (insufficient) {
        captureServer(`clerk:${clerkId}`, "paywall_viewed", {
          trigger: "tokens",
          wanted: "video_full",
          style: model,
          cost_tokens: cost,
        });
        return reply.code(402).send({
          error: `Not enough tokens — the full video costs ${cost}. Upgrade for more.`,
        });
      }
      if (!job) return reply.code(500).send({ error: "Could not start the job." });

      captureServer(`clerk:${clerkId}`, "video_full_started", {
        song_id: song.id,
        style: model,
        cost_tokens: cost,
        promoted_from_preview: true,
        permissive,
      });

      return reply.send(await toVideoJobDto(job));
    },
  );

  // Create a new style REUSING the frames of an already-rendered style — skips
  // (expensive) image generation, charging only the motion step. Autopilot renders
  // in one go; manual ({mode:"manual"}) opens the reused frames in review for
  // per-scene edits. The source must be a finished full (non-preview) video.
  app.post<{ Params: { id: string; targetModel: string; sourceModel: string } }>(
    "/songs/:id/videos/:targetModel/from/:sourceModel",
    async (req, reply) => {
      const clerkId = await getAuthUserId(req);
      if (!clerkId) return reply.code(401).send({ error: "Sign in to generate a video." });
      const user = await getOrCreateUser(clerkId);
      const body = (req.body ?? {}) as { mode?: unknown };
      const requestedMode = body.mode === "manual" ? "manual" : "autopilot";

      const { targetModel, sourceModel } = req.params;
      const isModel = (m: string): m is VideoModel =>
        (VIDEO_MODELS as readonly string[]).includes(m);
      if (!isModel(targetModel) || !isModel(sourceModel)) {
        return reply.code(400).send({ error: "Unknown style." });
      }
      if (targetModel === sourceModel) {
        return reply.code(400).send({ error: "Pick a different style to create." });
      }
      if (!VIDEO_MODEL_INFO[targetModel].enabled) {
        return reply
          .code(400)
          .send({ error: `${VIDEO_MODEL_INFO[targetModel].label} model is coming soon.` });
      }

      const [song] = await db.select().from(songs).where(eq(songs.id, req.params.id)).limit(1);
      if (!song || song.userId !== user.id) return reply.code(404).send({ error: "Not found." });

      // Reuse only from a FINISHED FULL render — a preview's 10s timeline wouldn't
      // map onto the target's full timeline.
      const [source] = await db
        .select()
        .from(videoJobs)
        .where(
          and(
            eq(videoJobs.songId, song.id),
            eq(videoJobs.model, sourceModel),
            eq(videoJobs.status, "ready"),
            eq(videoJobs.isPreview, false),
          ),
        )
        .orderBy(desc(videoJobs.createdAt))
        .limit(1);
      if (!source) {
        return reply.code(404).send({
          error: `Generate the full ${VIDEO_MODEL_INFO[sourceModel].label} video first.`,
        });
      }
      if (!source.segments || source.segments.length === 0) {
        return reply.code(422).send({ error: "Those frames are no longer available." });
      }

      // Clone the timeline + frame keys; reset per-segment runtime status so the new
      // job re-renders motion cleanly. buildSegments is deterministic so the source's
      // full timeline matches the target's exactly (imageKeys map 1:1). CRUCIAL: the
      // RENDERED clip is style-specific (Cinematic morphs frame[i]→frame[i+1]; Living
      // Scenes animates one frame), so drop clipKey/clipStatus and the TARGET style
      // regenerates its own. But KEEP each scene's motion DIRECTION — that's the
      // user's creative intent and carries across styles (the new clips are rendered
      // USING it, not the per-model default).
      const segments: VideoSegment[] = source.segments.map((s) => ({
        ...s,
        status: "pending",
        clipKey: null,
        clipStatus: "none",
      }));

      const { job, cost, insufficient } = await startVideoJob(
        user.id,
        user.credits,
        song,
        {
          styleDescription: source.styleDescription,
          sceneBrief: source.sceneBrief ?? undefined,
          mode: requestedMode,
          model: targetModel,
          aspectRatio: source.aspectRatio as AspectRatio,
          imageSize: source.imageSize as ImageSize,
          imageQuality: source.imageQuality as ImageQuality,
          sceneGrouping: (source.sceneGrouping ?? "line") as SceneGrouping,
          preview: false,
          prerenderImages: true,
          elementIds: source.elementIds ?? undefined, // carry the selected elements
        },
        { segments },
        source.characterImageKeys, // carry the source's members so reuse stays editable
      );
      if (insufficient) {
        captureServer(`clerk:${clerkId}`, "paywall_viewed", {
          trigger: "tokens",
          wanted: "video_full",
          style: targetModel,
          cost_tokens: cost,
        });
        return reply.code(402).send({
          error: `Not enough tokens — this costs ${cost}. Upgrade for more.`,
        });
      }
      if (!job) return reply.code(500).send({ error: "Could not start the job." });

      captureServer(`clerk:${clerkId}`, "video_full_started", {
        song_id: song.id,
        style: targetModel,
        cost_tokens: cost,
        reused_frames_from: sourceModel,
        mode: requestedMode,
      });

      return reply.send(await toVideoJobDto(job));
    },
  );

  // Re-open a FINISHED full video for editing: clone its frames into a new manual
  // job parked at "review" so the owner can swap scenes (regenerate images) and
  // re-render. No charge here and no pipeline run — the images already exist, so we
  // jump straight to review; the motion re-render is charged at finalize. A new job
  // (new R2 folder) keeps the live video + its cached download variants intact until
  // the edit succeeds; a discarded edit leaves the original untouched.
  app.post<{ Params: { id: string; model: string } }>(
    "/songs/:id/videos/:model/edit",
    async (req, reply) => {
      const clerkId = await getAuthUserId(req);
      if (!clerkId) return reply.code(401).send({ error: "Sign in to edit a video." });
      const user = await getOrCreateUser(clerkId);

      const model = req.params.model;
      if (!(VIDEO_MODELS as readonly string[]).includes(model)) {
        return reply.code(400).send({ error: "Unknown style." });
      }

      const [song] = await db.select().from(songs).where(eq(songs.id, req.params.id)).limit(1);
      if (!song || song.userId !== user.id) return reply.code(404).send({ error: "Not found." });

      // Only one render/edit per song at a time (activeVideoJobFor returns the
      // newest active job, so a second would orphan the first in the UI).
      const [active] = await db
        .select({ id: videoJobs.id })
        .from(videoJobs)
        .where(
          and(
            eq(videoJobs.songId, song.id),
            inArray(videoJobs.status, ["pending", "processing", "review"]),
          ),
        )
        .limit(1);
      if (active) {
        return reply.code(409).send({ error: "Finish the current video first." });
      }

      // The current finished FULL render for this style is what we re-open.
      const [source] = await db
        .select()
        .from(videoJobs)
        .where(
          and(
            eq(videoJobs.songId, song.id),
            eq(videoJobs.model, model as VideoModel),
            eq(videoJobs.status, "ready"),
            eq(videoJobs.isPreview, false),
          ),
        )
        .orderBy(desc(videoJobs.createdAt))
        .limit(1);
      if (!source) {
        return reply.code(404).send({ error: "Generate the full video first." });
      }
      if (!source.segments || source.segments.length === 0) {
        return reply.code(422).send({ error: "Those frames are no longer available." });
      }

      // Clone the timeline + frame keys verbatim. The imageKeys still point at the
      // source job's R2 folder (valid — the source is untouched); regenerating a
      // scene copies-on-write into THIS job's folder (see regenerateSegmentImage).
      const segments: VideoSegment[] = source.segments.map((s) => ({ ...s }));
      const [job] = await db
        .insert(videoJobs)
        .values({
          songId: song.id,
          userId: user.id,
          status: "review",
          mode: "manual",
          model: source.model,
          styleDescription: source.styleDescription,
          sceneBrief: source.sceneBrief ?? null,
          aspectRatio: source.aspectRatio,
          imageSize: source.imageSize as ImageSize,
          imageQuality: source.imageQuality as ImageQuality,
          isPreview: false,
          reuseFrames: true,
          segments,
          characterImageKeys: source.characterImageKeys ?? null,
          elementIds: source.elementIds ?? null,
          motionMode: source.motionMode,
          totalSegments: segments.length,
          completedSegments: segments.length,
          tokensCharged: 0,
        })
        .returning();
      if (!job) return reply.code(500).send({ error: "Could not open the editor." });

      captureServer(`clerk:${clerkId}`, "video_edit_started", {
        song_id: song.id,
        style: model,
        scenes: segments.length,
      });

      return reply.send(await toVideoJobDto(job));
    },
  );

  // Poll a video job. Owner-only. Times out stale processing jobs and refunds.
  app.get<{ Params: { id: string }; Querystring: { scenes?: string } }>(
    "/video-jobs/:id",
    async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);

    let [row] = await db.select().from(videoJobs).where(eq(videoJobs.id, req.params.id)).limit(1);
    if (!row || row.userId !== user.id) return reply.code(404).send({ error: "Not found." });

    // Reading a review draft = the owner is (re)opening the editor: touch it so the
    // abandoned-draft reaper (REVIEW_STALE_MS) only expires drafts nobody looks at.
    if (row.status === "review") {
      const [touched] = await db
        .update(videoJobs)
        .set({ updatedAt: new Date() })
        .where(and(eq(videoJobs.id, row.id), eq(videoJobs.status, "review")))
        .returning();
      if (touched) row = touched;
      return reply.send(await toVideoJobDto(row, { scenes: req.query.scenes === "1" }));
    }

    const wasRunning = row.status === "pending" || row.status === "processing";
    const reaped = await reapStaleVideoJob(row);
    if (!reaped) return reply.code(404).send({ error: "Not found." });
    row = reaped;
    if (wasRunning && row.status === "failed") {
      captureServer(`clerk:${clerkId}`, "video_failed", {
        song_id: row.songId,
        style: row.model,
        preview: row.isPreview,
        error: "timeout",
        tokens_refunded: row.tokensCharged,
      });
    }

    return reply.send(await toVideoJobDto(row, { scenes: req.query.scenes === "1" }));
    },
  );

  // Cancel a still-running generation (pending/processing): mark it failed + refund.
  // Covers stuck jobs (the in-process pipeline died on a restart) and ones the user
  // simply no longer wants. A live job completing right after is a harmless rare race.
  app.post<{ Params: { id: string } }>("/video-jobs/:id/cancel", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);

    const [row] = await db.select().from(videoJobs).where(eq(videoJobs.id, req.params.id)).limit(1);
    if (!row || row.userId !== user.id) return reply.code(404).send({ error: "Not found." });
    // Already done/failed, or in manual review (discard handles that) → nothing to do.
    if (row.status !== "pending" && row.status !== "processing") {
      return reply.send(await toVideoJobDto(row));
    }

    const [failed] = await db
      .update(videoJobs)
      .set({ status: "failed", error: "Generation cancelled.", updatedAt: new Date() })
      .where(
        and(
          eq(videoJobs.id, row.id),
          or(eq(videoJobs.status, "pending"), eq(videoJobs.status, "processing")),
        ),
      )
      .returning();
    if (!failed) return reply.send(await toVideoJobDto(row));
    await refund(failed);
    captureServer(`clerk:${clerkId}`, "video_failed", {
      song_id: failed.songId,
      style: failed.model,
      preview: failed.isPreview,
      error: "cancelled",
      tokens_refunded: failed.tokensCharged,
    });
    return reply.send(await toVideoJobDto(failed));
  });

  // A scene-level regeneration is 10-90s of model work; a double-click or a second
  // tab firing the same (job, kind, scene) would double-charge for a result the
  // user only sees once. Single-instance guard is enough (one Fastify process).
  const regensInFlight = new Set<string>();

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

      const flightKey = `${job.id}:image:${index}`;
      if (regensInFlight.has(flightKey)) {
        return reply.code(409).send({ error: "This scene is already regenerating." });
      }
      regensInFlight.add(flightKey);
      let segment;
      try {
        segment = await regenerateSegmentImage(job, index, parsed.data.direction, parsed.data.noCast);
      } catch (err) {
        req.log.error({ err }, "regenerate-segment failed");
        return reply.code(502).send({ error: "Could not regenerate this scene. Try again." });
      } finally {
        regensInFlight.delete(flightKey);
      }

      // Charge only after a successful regeneration.
      await db
        .update(users)
        .set({ credits: sql`GREATEST(${users.credits} - ${cost}, 0)`, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      return reply.send(segment);
    },
  );

  // Motion editor: regenerate ONE scene's motion clip (optionally with an edited
  // motion direction). Owner-only; job awaiting review; non-Slideshow only. Charges
  // singleClipTokens on success only.
  app.post<{ Params: { id: string; index: string } }>(
    "/video-jobs/:id/segments/:index/regenerate-clip",
    async (req, reply) => {
      const clerkId = await getAuthUserId(req);
      if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
      const user = await getOrCreateUser(clerkId);

      const parsed = regenerateClipSchema.safeParse(req.body ?? {});
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
      if (job.model === "fast") {
        return reply.code(400).send({ error: "Slideshow videos have no motion to edit." });
      }

      const seg = (job.segments ?? []).find((s) => s.index === index);
      if (!seg) return reply.code(404).send({ error: "Scene not found." });
      // Plates scenes generate their base on demand; others need the image first.
      if (!seg.imageKey && seg.textMode !== "plates") {
        return reply.code(400).send({ error: "Generate this scene's image first." });
      }

      // A plates scene regenerates ONLY its bare loop here (the lyrics are a
      // separate apply-plates step) — priced as one clip either way. The loop's
      // GENERATED length is user-selectable, but billing stays by the scene
      // window's clamped seconds (the loop tiles to fill it regardless).
      const cost = singleClipTokens(
        job.model,
        seg.clipEnd - seg.clipStart,
        job.imageQuality as ImageQuality,
      );
      if (user.credits < cost) {
        return reply.code(402).send({
          error: `Not enough tokens — regenerating a clip costs ${cost}. Upgrade for more.`,
        });
      }

      const flightKey = `${job.id}:clip:${index}`;
      if (regensInFlight.has(flightKey)) {
        return reply.code(409).send({ error: "This clip is already regenerating." });
      }
      regensInFlight.add(flightKey);
      let segment;
      try {
        segment = await regenerateSegmentClip(
          job,
          index,
          parsed.data.motionDirection,
          parsed.data.loopSeconds,
        );
      } catch (err) {
        req.log.error({ err }, "regenerate-clip failed");
        return reply.code(502).send({ error: "Could not regenerate this clip. Try again." });
      } finally {
        regensInFlight.delete(flightKey);
      }

      // Charge only after a successful regeneration.
      await db
        .update(users)
        .set({ credits: sql`GREATEST(${users.credits} - ${cost}, 0)`, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      return reply.send(segment);
    },
  );

  // Apply the lyric plates to a plates scene's already-generated loop — the
  // cheap half of the split flow. Missing stickers are generated (charged per
  // plate); existing ones are reused free, so re-compositing costs nothing.
  app.post<{ Params: { id: string; index: string } }>(
    "/video-jobs/:id/segments/:index/apply-plates",
    async (req, reply) => {
      const clerkId = await getAuthUserId(req);
      if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
      const user = await getOrCreateUser(clerkId);

      const index = Number(req.params.index);
      if (!Number.isInteger(index)) return reply.code(400).send({ error: "Invalid segment." });

      const [job] = await db
        .select()
        .from(videoJobs)
        .where(eq(videoJobs.id, req.params.id))
        .limit(1);
      if (!job || job.userId !== user.id) return reply.code(404).send({ error: "Not found." });
      if (job.mode !== "manual") {
        return reply.code(400).send({ error: "Scenes can only be edited on manual videos." });
      }
      if (job.status !== "review") {
        return reply.code(400).send({ error: "This video isn't open for editing." });
      }

      const seg = (job.segments ?? []).find((s) => s.index === index);
      if (!seg) return reply.code(404).send({ error: "Scene not found." });
      if (seg.textMode !== "plates") {
        return reply.code(400).send({ error: "This scene doesn't use lyric plates." });
      }
      if (!seg.loopClipKey) {
        return reply.code(400).send({ error: "Generate this scene's loop first." });
      }

      const missingPlates =
        seg.lines?.filter((l) => l.text.trim() && !l.plateKey).length ?? 0;
      const cost = missingPlates * singlePlateTokens();
      if (cost > 0 && user.credits < cost) {
        return reply.code(402).send({
          error: `Not enough tokens — applying the lyrics costs ${cost}. Upgrade for more.`,
        });
      }

      const flightKey = `${job.id}:plates:${index}`;
      if (regensInFlight.has(flightKey) || regensInFlight.has(`${job.id}:clip:${index}`)) {
        return reply.code(409).send({ error: "This scene is already generating." });
      }
      regensInFlight.add(flightKey);
      let segment;
      try {
        segment = await regenerateSegmentPlates(job, index);
      } catch (err) {
        req.log.error({ err }, "apply-plates failed");
        const msg =
          err instanceof Error && err.message === PLATES_QUEUE_BUSY
            ? PLATES_QUEUE_BUSY
            : "Could not apply the lyrics — you were not charged. Try again.";
        return reply.code(502).send({ error: msg });
      } finally {
        regensInFlight.delete(flightKey);
      }

      if (cost > 0) {
        await db
          .update(users)
          .set({ credits: sql`GREATEST(${users.credits} - ${cost}, 0)`, updatedAt: new Date() })
          .where(eq(users.id, user.id));
      }

      return reply.send(segment);
    },
  );

  // Motion editor: save a scene's motion direction WITHOUT regenerating (so the
  // next re-render picks it up). Marks the stored clip stale so finalize refreshes
  // it. Owner-only; review-status only; free.
  app.patch<{ Params: { id: string; index: string } }>(
    "/video-jobs/:id/segments/:index",
    async (req, reply) => {
      const clerkId = await getAuthUserId(req);
      if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
      const user = await getOrCreateUser(clerkId);

      const parsed = updateSegmentSchema.safeParse(req.body ?? {});
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

      if (!(job.segments ?? []).some((s) => s.index === index)) {
        return reply.code(404).send({ error: "Scene not found." });
      }

      // Merge under the row lock — this PATCH is fast, but it used to lose
      // against any concurrent regenerate writing its whole stale snapshot.
      let updated: VideoSegment | undefined;
      await patchJobSegments(job.id, (fresh) => {
        const f = fresh.find((s) => s.index === index);
        if (!f) return;
        if (parsed.data.motionDirection !== undefined) {
          const next = parsed.data.motionDirection?.trim() || null;
          if (next !== (f.motionDirection ?? null)) {
            f.motionDirection = next;
            // The stored clip no longer matches the requested motion → refresh on re-render.
            if (f.clipStatus === "ready") f.clipStatus = "stale";
          }
        }
        updated = f;
      });
      if (!updated) return reply.code(404).send({ error: "Scene not found." });
      return reply.send(await toReviewSegment(updated));
    },
  );

  // Manual mode: merge the consecutive scenes [from..to] into ONE shared-clip
  // scene — a single text-free base image + one looping motion clip, with each
  // lyric line delivered as an inpainted text plate on its sung timing
  // (textMode "plates"). Creation is free: the base/loop/plates are charged when
  // they generate. Constituents' generated assets are dropped (no refunds — same
  // rule as regenerating over them).
  app.post<{ Params: { id: string } }>("/video-jobs/:id/groups", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);

    const parsed = createSegmentGroupSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
    const { from, to } = parsed.data;
    if (to <= from) return reply.code(400).send({ error: "Select at least two scenes." });

    const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, req.params.id)).limit(1);
    if (!job || job.userId !== user.id) return reply.code(404).send({ error: "Not found." });
    if (job.status !== "review") {
      return reply.code(400).send({ error: "This video isn't open for editing." });
    }
    if (job.model !== "normal") {
      return reply.code(400).send({
        error:
          job.model === "pro"
            ? "Cinematic scenes can't share one clip — its shots morph into each other."
            : "Shared clips are for Living Scenes videos.",
      });
    }

    let ok = false;
    await patchJobSegments(job.id, (fresh) => {
      const range = fresh.filter((s) => s.index >= from && s.index <= to);
      if (range.length !== to - from + 1) return;
      const withText = range.filter((s) => s.text);
      if (withText.length === 0) return;
      // Flatten every sung line in the range (constituents may already be groups).
      const lines = range.flatMap(
        (s) =>
          s.lines?.map((l) => ({ ...l, plateKey: null })) ??
          (s.text ? [{ text: s.text, start: s.start, end: s.end, plateKey: null }] : []),
      );
      const first = range[0]!;
      const last = range[range.length - 1]!;
      const merged: VideoSegment = {
        ...first,
        text: lines.map((l) => l.text).join("\n"),
        start: lines[0]?.start ?? first.clipStart,
        end: lines[lines.length - 1]?.end ?? last.clipEnd,
        clipStart: first.clipStart,
        clipEnd: last.clipEnd,
        lines,
        textMode: parsed.data.textMode,
        plateRect: null,
        loopClipKey: null,
        imageKey: null,
        prompt: null,
        status: "pending",
        clipKey: null,
        clipStatus: "none",
      };
      fresh.splice(from, range.length, merged);
      fresh.forEach((s, i) => (s.index = i));
      ok = true;
    });
    if (!ok) return reply.code(400).send({ error: "Those scenes can't be grouped." });

    const [row] = await db.select().from(videoJobs).where(eq(videoJobs.id, job.id)).limit(1);
    if (!row) return reply.code(404).send({ error: "Not found." });
    await db
      .update(videoJobs)
      .set({ totalSegments: row.segments?.length ?? 0, updatedAt: new Date() })
      .where(eq(videoJobs.id, job.id));
    captureServer(`clerk:${clerkId}`, "video_scenes_grouped", {
      job_id: job.id,
      from,
      to,
      lines: to - from + 1,
    });
    return reply.send(await toVideoJobDto({ ...row, totalSegments: row.segments?.length ?? 0 }, { scenes: true }));
  });

  // Flip a grouped scene between "show at once" (baked stanza) and "show in
  // sequence" (plates). Free; resets the scene's generated assets — they encode
  // the old mode (a stanza image can't serve as a plates base and vice versa).
  app.patch<{ Params: { id: string; index: string } }>(
    "/video-jobs/:id/groups/:index",
    async (req, reply) => {
      const clerkId = await getAuthUserId(req);
      if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
      const user = await getOrCreateUser(clerkId);
      const parsed = updateSegmentGroupSchema.safeParse(req.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
      const index = Number(req.params.index);
      if (!Number.isInteger(index)) return reply.code(400).send({ error: "Invalid scene." });

      const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, req.params.id)).limit(1);
      if (!job || job.userId !== user.id) return reply.code(404).send({ error: "Not found." });
      if (job.status !== "review") {
        return reply.code(400).send({ error: "This video isn't open for editing." });
      }
      if (parsed.data.textMode === "plates" && job.model !== "normal") {
        return reply.code(400).send({ error: "Show-in-sequence needs a Living Scenes video." });
      }

      let ok = false;
      await patchJobSegments(job.id, (fresh) => {
        const seg = fresh.find((s) => s.index === index);
        if (!seg || !seg.lines || seg.lines.length < 2) return;
        if (seg.textMode === parsed.data.textMode) {
          ok = true; // no-op
          return;
        }
        seg.textMode = parsed.data.textMode;
        seg.imageKey = null;
        seg.prompt = null;
        seg.status = "pending";
        seg.clipKey = null;
        seg.clipStatus = "none";
        seg.loopClipKey = null;
        seg.plateRect = null;
        for (const l of seg.lines) l.plateKey = null;
        ok = true;
      });
      if (!ok) return reply.code(400).send({ error: "This scene isn't a group." });

      const [row] = await db.select().from(videoJobs).where(eq(videoJobs.id, job.id)).limit(1);
      if (!row) return reply.code(404).send({ error: "Not found." });
      return reply.send(await toVideoJobDto(row, { scenes: true }));
    },
  );

  // Move a BOUNDARY lyric line to the adjacent scene (drag-a-bubble in the
  // editor). Lyric timing is fixed, so only the first line can move backward
  // and the last line forward. Both scenes' generated assets reset — their
  // windows changed, so image + clip no longer match. Free (regeneration is
  // charged when it runs, same rule as grouping).
  app.post<{ Params: { id: string } }>("/video-jobs/:id/lines/move", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);

    const parsed = moveSegmentLineSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });
    const { fromScene, lineIndex, toScene } = parsed.data;
    if (Math.abs(toScene - fromScene) !== 1) {
      return reply.code(400).send({ error: "Lines can only move to the neighboring scene." });
    }

    const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, req.params.id)).limit(1);
    if (!job || job.userId !== user.id) return reply.code(404).send({ error: "Not found." });
    if (job.status !== "review") {
      return reply.code(400).send({ error: "This video isn't open for editing." });
    }

    let error: string | null = null;
    await patchJobSegments(job.id, (fresh) => {
      const src = fresh.find((s) => s.index === fromScene);
      const dst = fresh.find((s) => s.index === toScene);
      if (!src || !dst) return void (error = "Scene not found.");
      if (!dst.text) return void (error = "Lines can't join an instrumental scene.");
      // Normalize both to lines[] form (legacy singles become 1-line groups).
      const srcLines = src.lines ?? [{ text: src.text, start: src.start, end: src.end, plateKey: null }];
      const dstLines = dst.lines ?? [{ text: dst.text, start: dst.start, end: dst.end, plateKey: null }];
      const movingBack = toScene < fromScene;
      const boundaryOk = movingBack ? lineIndex === 0 : lineIndex === srcLines.length - 1;
      const moved = srcLines[lineIndex];
      if (!moved || !boundaryOk) {
        return void (error = "Only the first or last line of a scene can move to its neighbor.");
      }

      const resetAssets = (s: VideoSegment) => {
        s.imageKey = null;
        s.prompt = null;
        s.status = "pending";
        s.clipKey = null;
        s.clipStatus = "none";
        s.loopClipKey = null;
        s.plateRect = null;
        if (s.lines) for (const l of s.lines) l.plateKey = null;
      };
      const rejoin = (s: VideoSegment, ls: typeof srcLines) => {
        s.lines = ls.map((l) => ({ ...l, plateKey: null }));
        s.text = ls.map((l) => l.text).join("\n");
        s.start = ls[0]!.start;
        s.end = ls[ls.length - 1]!.end;
      };

      const rest = srcLines.filter((_, i) => i !== lineIndex);
      if (movingBack) {
        // src's first line joins the PREVIOUS scene; the boundary shifts to the
        // start of src's new first line (or src dissolves entirely).
        const newBoundary = rest[0]?.start ?? src.clipEnd;
        rejoin(dst, [...dstLines, { ...moved, plateKey: null }]);
        dst.clipEnd = newBoundary;
        resetAssets(dst);
        if (rest.length === 0) {
          fresh.splice(fresh.indexOf(src), 1);
        } else {
          rejoin(src, rest);
          src.clipStart = newBoundary;
          resetAssets(src);
        }
      } else {
        // src's last line joins the NEXT scene; the boundary shifts to the
        // moved line's start (or src dissolves entirely).
        const newBoundary = rest.length > 0 ? moved.start : src.clipStart;
        rejoin(dst, [{ ...moved, plateKey: null }, ...dstLines]);
        dst.clipStart = newBoundary;
        resetAssets(dst);
        if (rest.length === 0) {
          fresh.splice(fresh.indexOf(src), 1);
        } else {
          rejoin(src, rest);
          src.clipEnd = newBoundary;
          resetAssets(src);
        }
      }
      fresh.forEach((s, i) => (s.index = i));
    });
    if (error) return reply.code(400).send({ error });

    const [row] = await db.select().from(videoJobs).where(eq(videoJobs.id, job.id)).limit(1);
    if (!row) return reply.code(404).send({ error: "Not found." });
    await db
      .update(videoJobs)
      .set({ totalSegments: row.segments?.length ?? 0, updatedAt: new Date() })
      .where(eq(videoJobs.id, job.id));
    return reply.send(
      await toVideoJobDto({ ...row, totalSegments: row.segments?.length ?? 0 }, { scenes: true }),
    );
  });

  // Split a shared-clip scene back into per-line scenes (free; its generated
  // assets are dropped). The per-line windows re-tile the group's span.
  app.delete<{ Params: { id: string; index: string } }>(
    "/video-jobs/:id/groups/:index",
    async (req, reply) => {
      const clerkId = await getAuthUserId(req);
      if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
      const user = await getOrCreateUser(clerkId);
      const index = Number(req.params.index);
      if (!Number.isInteger(index)) return reply.code(400).send({ error: "Invalid scene." });

      const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, req.params.id)).limit(1);
      if (!job || job.userId !== user.id) return reply.code(404).send({ error: "Not found." });
      if (job.status !== "review") {
        return reply.code(400).send({ error: "This video isn't open for editing." });
      }

      let ok = false;
      await patchJobSegments(job.id, (fresh) => {
        const seg = fresh.find((s) => s.index === index);
        // Any grouped scene (baked stanza OR plates) can be split back to lines.
        if (!seg || !seg.lines || seg.lines.length < 2) return;
        const lines = seg.lines;
        const parts: VideoSegment[] = lines.map((l, i) => ({
          ...seg,
          text: l.text,
          start: l.start,
          end: l.end,
          // Re-tile the group's window contiguously across the lines.
          clipStart: i === 0 ? seg.clipStart : lines[i]!.start,
          clipEnd: i === lines.length - 1 ? seg.clipEnd : lines[i + 1]!.start,
          lines: undefined,
          textMode: undefined,
          plateRect: undefined,
          loopClipKey: undefined,
          imageKey: null,
          prompt: null,
          status: "pending" as const,
          clipKey: null,
          clipStatus: "none" as const,
        }));
        fresh.splice(index, 1, ...parts);
        fresh.forEach((s, i) => (s.index = i));
        ok = true;
      });
      if (!ok) return reply.code(400).send({ error: "This scene isn't a group." });

      const [row] = await db.select().from(videoJobs).where(eq(videoJobs.id, job.id)).limit(1);
      if (!row) return reply.code(404).send({ error: "Not found." });
      await db
        .update(videoJobs)
        .set({ totalSegments: row.segments?.length ?? 0, updatedAt: new Date() })
        .where(eq(videoJobs.id, job.id));
      return reply.send(
        await toVideoJobDto({ ...row, totalSegments: row.segments?.length ?? 0 }, { scenes: true }),
      );
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
  // Owner-only; job must be awaiting review. A first-time manual job paid the full
  // cost up front (free here); a re-edit of a finished video (reuseFrames) only
  // paid per regenerated image so far, so the motion re-render is charged now.
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

    // What finalize charges (paid on success; refunded by failJob):
    //  • reuse/edit (reuseFrames): images are reused → only the (re)generated clips
    //    (reRenderTokens: stale/missing clips; MIN for Slideshow).
    //  • no-prerender manual: nothing was paid up front → the images finalize must
    //    still generate (singleImageTokens × blank scenes) + the clips.
    //  • prerender manual: free (the full cost was paid up front).
    const segs = job.segments ?? [];
    let charge = 0;
    if (job.reuseFrames) {
      charge = reRenderTokens(job.model, segs, job.imageQuality as ImageQuality);
    } else if (!job.prerenderImages) {
      const blankImages = segs.filter((s) => !s.imageKey).length;
      charge =
        blankImages * singleImageTokens(job.imageQuality as ImageQuality, job.imageSize as ImageSize) +
        reRenderTokens(job.model, segs, job.imageQuality as ImageQuality);
    }
    // Shared-clip groups are created in review, AFTER any up-front charge — so
    // their un-generated text plates are charged here. EXCEPTION: "single"
    // grouping plans its plates AT CREATE (buildSegments stamps textMode), so a
    // prerender job's up-front estimate already includes them — charging again
    // here would double-bill.
    const platesPrepaid = job.sceneGrouping === "single" && job.prerenderImages && !job.reuseFrames;
    if (!platesPrepaid) {
      const missingPlates = segs
        .filter((s) => s.textMode === "plates")
        .reduce((n, s) => n + (s.lines?.filter((l) => l.text.trim() && !l.plateKey).length ?? 0), 0);
      charge += missingPlates * singlePlateTokens();
    }
    if (charge > 0 && user.credits < charge) {
      captureServer(`clerk:${clerkId}`, "paywall_viewed", {
        trigger: "tokens",
        wanted: "video_reedit",
        style: job.model,
        cost_tokens: charge,
      });
      return reply.code(402).send({
        error: `Not enough tokens — finishing this video costs ${charge}. Upgrade for more.`,
      });
    }

    // Atomically claim the review job → processing, so the client immediately
    // shows the progress view and resumes polling (idempotent against a double
    // click). Stamp tokensCharged for a re-edit so a failure refunds the right
    // amount (failJob refunds job.tokensCharged). Then fire the assembly.
    const [claimed] = await db
      .update(videoJobs)
      .set({
        status: "processing",
        completedSegments: 0,
        ...(charge > 0 ? { tokensCharged: charge } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(videoJobs.id, job.id), eq(videoJobs.status, "review")))
      .returning();
    if (!claimed) {
      return reply.code(409).send({ error: "This video is already being generated." });
    }

    // Charge only after a successful claim (refunded by the pipeline on failure).
    if (charge > 0) {
      await db
        .update(users)
        .set({ credits: sql`GREATEST(${users.credits} - ${charge}, 0)`, updatedAt: new Date() })
        .where(eq(users.id, user.id));
      captureServer(`clerk:${clerkId}`, "video_full_started", {
        song_id: job.songId,
        style: job.model,
        cost_tokens: charge,
        reedit: true,
      });
    }

    void finalizeVideoJob(claimed.id);

    return reply.send(await toVideoJobDto(claimed));
  });

  // Discard a manual review without rendering — used to cancel an "Edit scenes"
  // session (or abandon a first-time manual job). Owner-only; review-status only.
  // Deletes the job row (refunding any up-front charge) and best-effort removes
  // the frames this job itself generated (NOT the source video's frames, which
  // live under a different folder and back the still-live video).
  app.delete<{ Params: { id: string } }>("/video-jobs/:id", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    const user = await getOrCreateUser(clerkId);

    const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, req.params.id)).limit(1);
    if (!job || job.userId !== user.id) return reply.code(404).send({ error: "Not found." });
    if (job.status !== "review") {
      return reply.code(400).send({ error: "This video isn't open for editing." });
    }

    // Row delete (conditional on review), refund of any up-front charge (0 for an
    // edit job — its re-render is charged at finalize), and cleanup of the frames +
    // clips under THIS job's own folder. Shared with the abandoned-draft reaper.
    await discardReviewVideoJob(job);

    return reply.send({ ok: true });
  });
}
