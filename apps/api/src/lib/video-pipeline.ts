import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import {
  type AspectRatio,
  buildPreviewSegments,
  buildSegments,
  capForPreview,
  type CharacterReference,
  CHARACTER_REFS_PER_FRAME,
  CINEMATIC_MAX_SECONDS,
  CINEMATIC_MIN_SECONDS,
  findMentionedNames,
  GROK_MAX_SECONDS,
  GROK_MIN_SECONDS,
  type ImageQuality,
  type ImageSize,
  LITE_CLIP_MAX_SECONDS,
  LITE_CLIP_MIN_SECONDS,
  normalizeCharacterRefs,
  type ReviewSegment,
  type SceneGrouping,
  VIDEO_MODEL_INFO,
  type VideoSegment,
} from "@syllary/shared";
import { db } from "../db/client.js";
import {
  songElements,
  songs,
  songVideos,
  users,
  videoJobs,
  type VideoJobRow,
} from "../db/schema.js";
import { buildBackdropPrompt, generateBackdrop } from "./openrouter-image.js";
import { buildLitePrompt, generateLiteBackdrop } from "./fal-image.js";
import {
  applyPlatesToLoop,
  loopFillClip,
  materializeLoopClip,
  materializePlatesClip,
} from "./plates.js";
import { videoArtBrief } from "./openrouter.js";
import { generateMotionClip } from "./fal-video.js";
import {
  concatClips,
  fitClipToDuration,
  type LyricCue,
  muxAudio,
  normalizeFrameToJpeg,
  overlayLyricsAndMux,
  speedFitClip,
  stitchLyricsVideo,
  type StitchSegment,
} from "./ffmpeg.js";
import { captureForUserId } from "./posthog.js";
import { presignGet, putObject } from "./r2.js";

// How many backdrop images to generate concurrently. Keeps us well under
// OpenRouter rate limits while still finishing a ~30-line song quickly.
const IMAGE_CONCURRENCY = 4;
// How many clips to generate at once. Higher = much faster wall-clock; the
// video client retries on 429 so a brief provider throttle won't fail the job.
const VIDEO_CONCURRENCY = 6;
// Segment planning + clip-duration clamps now live in @syllary/shared
// (video-plan.ts) so the generate modal can price a job from the SAME timeline
// the renderer produces. See buildSegments / capForPreview / *_SECONDS imports.

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function failJob(job: VideoJobRow, message: string): Promise<void> {
  await db
    .update(videoJobs)
    .set({ status: "failed", error: message, updatedAt: new Date() })
    .where(eq(videoJobs.id, job.id));
  if (job.userId && job.tokensCharged > 0) {
    await db
      .update(users)
      .set({ credits: sql`${users.credits} + ${job.tokensCharged}`, updatedAt: new Date() })
      .where(eq(users.id, job.userId));
  }
  void captureForUserId(job.userId, "video_failed", {
    song_id: job.songId,
    style: job.model,
    preview: job.isPreview,
    error: message,
    tokens_refunded: job.tokensCharged,
  });
}

async function bumpProgress(jobId: string, segments: VideoSegment[]): Promise<void> {
  await db
    .update(videoJobs)
    .set({ completedSegments: sql`${videoJobs.completedSegments} + 1`, segments, updatedAt: new Date() })
    .where(eq(videoJobs.id, jobId));
}

/** A job that hasn't advanced in this long is treated as dead (the in-process
 *  pipeline doesn't survive an API restart). */
export const VIDEO_STALE_MS = 20 * 60 * 1000;

/** Stuck-job reaper. A lyric-video job runs in-process, fire-and-forget, so an API
 *  restart leaves it "pending"/"processing" forever — showing "Generating…" on the
 *  dashboard and blocking edits. If such a job hasn't advanced in VIDEO_STALE_MS,
 *  mark it failed and refund its tokens. "review" jobs are NEVER reaped (a manual
 *  edit can sit open indefinitely). Idempotent + safe to call on any read of a job. */
export async function reapStaleVideoJob(row: VideoJobRow): Promise<VideoJobRow> {
  const running = row.status === "pending" || row.status === "processing";
  if (!running) return row;
  if (Date.now() - row.updatedAt.getTime() <= VIDEO_STALE_MS) return row;
  const [failed] = await db
    .update(videoJobs)
    .set({ status: "failed", error: "Video generation timed out.", updatedAt: new Date() })
    .where(
      and(
        eq(videoJobs.id, row.id),
        or(eq(videoJobs.status, "pending"), eq(videoJobs.status, "processing")),
      ),
    )
    .returning();
  if (!failed) return row;
  if (failed.userId && failed.tokensCharged > 0) {
    await db
      .update(users)
      .set({ credits: sql`${users.credits} + ${failed.tokensCharged}`, updatedAt: new Date() })
      .where(eq(users.id, failed.userId));
  }
  return failed;
}

/** The song's elements that have an image — mention-resolvable reference subjects.
 *  Restricted to the job's selected `elementIds` when set; null/undefined (legacy
 *  jobs) falls back to the whole song catalog. An empty array selects nothing. */
type ElementRef = { name: string; imageKey: string };
async function loadSongElementRefs(
  songId: string,
  elementIds?: string[] | null,
): Promise<ElementRef[]> {
  if (elementIds && elementIds.length === 0) return [];
  const where =
    elementIds && elementIds.length > 0
      ? and(eq(songElements.songId, songId), inArray(songElements.id, elementIds))
      : eq(songElements.songId, songId);
  const rows = await db
    .select({ name: songElements.name, imageKey: songElements.imageKey })
    .from(songElements)
    .where(where);
  return rows.flatMap((r) => (r.imageKey ? [{ name: r.name, imageKey: r.imageKey }] : []));
}

/** The named references to feed the image model for one frame. Mention-driven and
 *  SYMMETRIC across band members AND the song's elements: whoever is @mentioned in
 *  this scene's direction (else the brief) is the cast — EXACTLY those subjects and
 *  no one else. With no @mention anywhere, the cast defaults to the whole band
 *  (members only); elements are mention-only, never default-included. The per-frame
 *  budget (CHARACTER_REFS_PER_FRAME) is shared FAIRLY — every subject gets its 1st
 *  photo (round-robin) before any subject takes a 2nd — so a member with several
 *  photos can't crowd a mentioned element out of the frame.
 *
 *  Why both halves matter: the previous logic narrowed only MEMBERS by @mention, so
 *  naming just an element ("@Rex and @Liza") left "no member mentioned → include ALL
 *  members" and a multi-photo member then ate the whole budget — the frame always
 *  drew the band member + the first element, never the rest. */
function frameCharacterRefs(
  job: VideoJobRow,
  seg: VideoSegment,
  elementCatalog: ElementRef[],
): CharacterReference[] {
  // Scenery-only scene: the user marked it "No one" — no recurring subjects at all
  // (overrides the default of including the whole band when nobody is mentioned).
  if (seg.noCast) return [];
  const members = normalizeCharacterRefs(job.characterImageKeys);
  const elements: CharacterReference[] = elementCatalog.map((e) => ({
    name: e.name,
    imageKeys: [e.imageKey],
  }));

  // One @mention pool over members + elements. Direction wins; else the brief.
  const everyone = [...members, ...elements];
  const named = everyone.map((r) => r.name).filter((n) => n.trim().length > 0);
  const fromDir = findMentionedNames(seg.direction ?? "", named);
  const mentioned = fromDir.length > 0 ? fromDir : findMentionedNames(job.sceneBrief ?? "", named);

  // Named someone → exactly those subjects. Named no one → the whole band only.
  let cast: CharacterReference[];
  if (mentioned.length > 0) {
    const want = new Set(mentioned.map((n) => n.toLowerCase()));
    cast = everyone.filter((r) => want.has(r.name.toLowerCase()));
  } else {
    cast = members;
  }

  // Fair round-robin within the per-frame budget: every subject takes its photo at
  // `round` in turn, so each gets a 1st before anyone gets a 2nd.
  const out = cast.map((c) => ({ ref: c, imageKeys: [] as string[] }));
  let used = 0;
  let round = 0;
  let progressed = true;
  while (progressed && used < CHARACTER_REFS_PER_FRAME) {
    progressed = false;
    for (const entry of out) {
      if (used >= CHARACTER_REFS_PER_FRAME) break;
      const key = entry.ref.imageKeys[round];
      if (!key) continue;
      entry.imageKeys.push(key);
      used += 1;
      progressed = true;
    }
    round += 1;
  }
  return out
    .filter((e) => e.imageKeys.length > 0)
    .map((e) => ({ name: e.ref.name, imageKeys: e.imageKeys }));
}

/** Generate one Nano Banana frame for a segment, save it locally + to R2, and
 *  return a presigned URL (video models need a remote image URL). */
async function makeFrame(
  job: VideoJobRow,
  seg: VideoSegment,
  aspectRatio: AspectRatio,
  workDir: string,
  elementCatalog: ElementRef[],
): Promise<{ imageFile: string; imageUrl: string }> {
  // "overlay" (grouped Cinematic) and "plates" scenes get TEXT-FREE frames — the
  // lyrics arrive later via the timed ASS overlay / inpainted plates. Everything
  // else (absent textMode = every legacy job) bakes the text in, as always.
  const renderText = seg.textMode !== "overlay" && seg.textMode !== "plates";
  // Rebuild the prompt from the structured parts every time (style + context are
  // job-wide; direction is per-scene, defaulting to the lyric line) so editing a
  // shared field propagates to every not-yet-regenerated frame. Persisted for the
  // record (manual mode shows the parts, not this blob).
  const isLite = job.imageQuality === "lite";
  const characterReferences = isLite ? [] : frameCharacterRefs(job, seg, elementCatalog);
  // Lite renders on Qwen (diffusion dialect — no cast, no song context: stray
  // instruction words get painted into the scene); everything else on Gemini.
  const prompt = isLite
    ? buildLitePrompt({
        style: job.styleDescription,
        lyricText: seg.text,
        direction: seg.direction ?? undefined,
        renderText,
      })
    : buildBackdropPrompt({
        style: job.styleDescription,
        lyricText: seg.text,
        aspectRatio,
        renderText,
        context: job.sceneBrief ?? undefined,
        direction: seg.direction ?? undefined,
        characterReferences,
      });
  seg.prompt = prompt;
  const raw = isLite
    ? await generateLiteBackdrop({
        style: job.styleDescription,
        lyricText: seg.text,
        aspectRatio,
        renderText,
        direction: seg.direction ?? undefined,
        promptOverride: prompt,
      })
    : await generateBackdrop({
        style: job.styleDescription,
        lineText: seg.text,
        aspectRatio,
        imageSize: job.imageSize as ImageSize,
        quality: job.imageQuality as ImageQuality,
        renderText,
        promptOverride: prompt,
        characterReferences: characterReferences.length > 0 ? characterReferences : undefined,
      });
  // Standardize every frame to one baseline JPEG before it touches disk/R2 — the
  // model returns a mix of PNG/JPEG with varying metadata, which makes the slideshow
  // stitch drop frames. See normalizeFrameToJpeg.
  const buf = await normalizeFrameToJpeg(raw);
  const imageFile = path.join(workDir, `img_${seg.index}.jpg`);
  await writeFile(imageFile, buf);
  const imageKey = `video/${job.songId}/${job.id}/img_${seg.index}.jpg`;
  await uploadImageReliably(imageKey, buf);
  seg.imageKey = imageKey;
  return { imageFile, imageUrl: await presignGet(imageKey) };
}

/** Upload a frame to R2 with retries. Not best-effort: the AI-video styles feed
 *  the resulting presigned URL to the model, so a silently-failed upload would
 *  yield a dead URL ("Image URL could not be fetched"). */
async function uploadImageReliably(
  imageKey: string,
  buf: Buffer,
  contentType = "image/jpeg",
): Promise<void> {
  let uploadErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await putObject(imageKey, buf, contentType);
      return;
    } catch (e) {
      uploadErr = e;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error(`Could not store frame in R2: ${(uploadErr as Error).message}`);
}

/** Manual mode: regenerate one segment's image (optionally with an edited
 *  prompt), overwrite its R2 object, persist, and return the updated card.
 *  Throws on failure (the route then charges nothing). */
export async function regenerateSegmentImage(
  job: VideoJobRow,
  index: number,
  newDirection?: string,
  noCast?: boolean,
): Promise<ReviewSegment> {
  const segments = job.segments ?? [];
  const seg = segments.find((s) => s.index === index);
  if (!seg) throw new Error("Segment not found.");

  const aspectRatio = job.aspectRatio as AspectRatio;
  // An explicit direction (even empty → clear back to the lyric line) updates the
  // scene; omitted re-rolls with whatever is already stored.
  if (newDirection !== undefined) seg.direction = newDirection.trim() || null;
  // Scenery-only toggle ("No one") — persisted so finalize/re-render honors it too.
  if (noCast !== undefined) seg.noCast = noCast;
  // Members + the song's elements @mentioned in this scene (mention-driven, within
  // the job's selected element set).
  const elementCatalog = await loadSongElementRefs(job.songId, job.elementIds);
  const isLite = job.imageQuality === "lite";
  // Overlay/plates scenes regenerate TEXT-FREE (same rule as makeFrame).
  const renderText = seg.textMode !== "overlay" && seg.textMode !== "plates";
  const characterReferences = isLite ? [] : frameCharacterRefs(job, seg, elementCatalog);
  const prompt = isLite
    ? buildLitePrompt({
        style: job.styleDescription,
        lyricText: seg.text,
        direction: seg.direction ?? undefined,
        renderText,
      })
    : buildBackdropPrompt({
        style: job.styleDescription,
        lyricText: seg.text,
        aspectRatio,
        renderText,
        context: job.sceneBrief ?? undefined,
        direction: seg.direction ?? undefined,
        characterReferences,
      });
  seg.prompt = prompt;

  const raw = isLite
    ? await generateLiteBackdrop({
        style: job.styleDescription,
        lyricText: seg.text,
        aspectRatio,
        renderText,
        direction: seg.direction ?? undefined,
        promptOverride: prompt,
      })
    : await generateBackdrop({
        style: job.styleDescription,
        lineText: seg.text,
        aspectRatio,
        imageSize: job.imageSize as ImageSize,
        quality: job.imageQuality as ImageQuality,
        renderText,
        promptOverride: prompt,
        characterReferences: characterReferences.length > 0 ? characterReferences : undefined,
      });
  // Standardize to one baseline JPEG (see normalizeFrameToJpeg) so a regenerated
  // scene matches the rest and the slideshow stitch never drops it.
  const buf = await normalizeFrameToJpeg(raw);
  // Always write to THIS job's own key (never reuse seg.imageKey blindly): for an
  // edit job (reopened video) the segment still points at the SOURCE job's frame,
  // and overwriting that would corrupt the original video's images. Writing to our
  // own namespace is copy-on-write — the source is untouched, unedited segments
  // keep pointing at it, and materializeFrame downloads whichever key each holds.
  const imageKey = `video/${job.songId}/${job.id}/img_${seg.index}.jpg`;
  await uploadImageReliably(imageKey, buf);

  // All slow work is done — now merge into the CURRENT row under the lock, so a
  // concurrent regen of another scene can't be reverted by our stale snapshot.
  const direction = seg.direction;
  const noCastFinal = seg.noCast;
  let updated: VideoSegment | undefined;
  await patchJobSegments(job.id, (fresh) => {
    const f = fresh.find((s) => s.index === index);
    if (!f) return;
    f.direction = direction;
    f.noCast = noCastFinal;
    f.prompt = prompt;
    f.imageKey = imageKey;
    f.status = "done";
    // The motion clip (if any) was built from the OLD image — flag it for refresh
    // so the re-render regenerates it to match. Cinematic morphs frame[i] →
    // frame[i+1], so the PREVIOUS clip (which morphs INTO this frame) goes stale too.
    if (f.clipStatus === "ready") f.clipStatus = "stale";
    if (job.model === "pro" && f.index > 0) {
      const prev = fresh.find((s) => s.index === f.index - 1);
      if (prev && prev.clipStatus === "ready") prev.clipStatus = "stale";
    }
    // A plates scene's loop + lyric plates were cut from the OLD base — they all
    // regenerate with the next clip run / at render.
    if (f.textMode === "plates") {
      f.loopClipKey = null;
      f.plateRect = null;
      f.clipKey = null;
      f.clipStatus = "none";
      if (f.lines) for (const l of f.lines) l.plateKey = null;
    }
    updated = f;
  });

  return toReviewSegment(updated ?? seg);
}

/** The job's scene-grouping mode. Legacy rows (and the DB default) are "line". */
function grouping(job: VideoJobRow): SceneGrouping {
  return (job.sceneGrouping as SceneGrouping) ?? "line";
}

/** Decide how each scene's lyric text reaches the screen. Only GROUPED scenes
 *  (lines[] present) get an explicit mode: baked stanza block for Slideshow +
 *  Living Scenes, text-free frame + timed ASS overlay for Cinematic (whose
 *  motion model would warp a whole baked stanza beyond reading). Ungrouped
 *  ("line") jobs keep textMode absent = exactly today's behavior everywhere.
 *  Plates mode is never stamped here — it's a per-scene editor action. */
function stampTextModes(job: VideoJobRow, segments: VideoSegment[]): void {
  for (const seg of segments) {
    if (!seg.lines || seg.textMode) continue;
    if (!seg.text) continue; // instrumental — nothing to show
    seg.textMode = job.model === "pro" ? "overlay" : "baked";
  }
}

/** Atomically merge a mutation into the job's CURRENT segments row. The manual
 *  editor regenerates several scenes in parallel; each request used to write its
 *  whole stale snapshot back, silently reverting whichever finished earlier.
 *  SELECT … FOR UPDATE serializes the read-mutate-write (held for microseconds —
 *  all slow model work happens before calling this), and is correct even if the
 *  API ever runs more than one instance. */
export async function patchJobSegments(
  jobId: string,
  mutate: (segments: VideoSegment[]) => void,
): Promise<VideoSegment[]> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ segments: videoJobs.segments })
      .from(videoJobs)
      .where(eq(videoJobs.id, jobId))
      .for("update")
      .limit(1);
    const segments = row?.segments ?? [];
    mutate(segments);
    await tx
      .update(videoJobs)
      .set({ segments, updatedAt: new Date() })
      .where(eq(videoJobs.id, jobId));
    return segments;
  });
}

/** Get a segment's frame into the local workDir: download the already-generated
 *  image from R2 (manual finalize / re-runs), or generate it if none exists yet
 *  (autopilot). One code path so finalize reuses approved images and autopilot
 *  is unchanged. */
async function materializeFrame(
  job: VideoJobRow,
  seg: VideoSegment,
  aspectRatio: AspectRatio,
  workDir: string,
  elementCatalog: ElementRef[],
): Promise<{ imageFile: string; imageUrl: string }> {
  const t = Date.now();
  if (seg.imageKey) {
    const imageUrl = await presignGet(seg.imageKey);
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Could not fetch frame ${seg.index} (HTTP ${res.status}).`);
    const buf = Buffer.from(await res.arrayBuffer());
    // Local name is extension-agnostic (the stitch references it by basename and
    // ffmpeg probes the real format); new frames are normalized JPEG, older ones
    // may be PNG — either decodes fine.
    const imageFile = path.join(workDir, `img_${seg.index}.jpg`);
    await writeFile(imageFile, buf);
    console.log(`[materialize] seg=${seg.index} download ms=${Date.now() - t} bytes=${buf.length}`);
    return { imageFile, imageUrl };
  }
  // No stored frame → we GENERATE one here (a Nano Banana call). Logged loudly
  // because at finalize this is unexpected + slow — it means a scene was never
  // generated during review.
  const made = await makeFrame(job, seg, aspectRatio, workDir, elementCatalog);
  console.log(`[materialize] seg=${seg.index} GENERATED (no imageKey) ms=${Date.now() - t}`);
  return made;
}

/** Build the per-segment client view (manual review): presign the frame + clip.
 *  Single source of truth for the ReviewSegment DTO — used by the routes and by
 *  both regenerate handlers. */
export async function toReviewSegment(seg: VideoSegment): Promise<ReviewSegment> {
  return {
    index: seg.index,
    text: seg.text,
    prompt: seg.prompt,
    direction: seg.direction ?? null,
    status: seg.status,
    imageUrl: seg.imageKey ? await presignGet(seg.imageKey) : null,
    motionDirection: seg.motionDirection ?? null,
    clipUrl: seg.clipKey ? await presignGet(seg.clipKey) : null,
    clipStatus: seg.clipStatus ?? "none",
    clipStart: seg.clipStart,
    clipEnd: seg.clipEnd,
    noCast: seg.noCast ?? false,
    // Grouped scenes: per-line text + sung windows (no storage keys — the editor
    // shows plate progress as a count, keeping polls cheap).
    lines: seg.lines?.map((l) => ({ text: l.text, start: l.start, end: l.end })),
    textMode: seg.textMode ?? "baked",
    platesReady: seg.lines?.filter((l) => l.plateKey != null).length ?? 0,
    platesApplied: seg.platesApplied ?? true,
    loopSeconds: seg.loopSeconds ?? null,
  };
}

/** Upload a finished clip to R2 with retries (mirrors uploadImageReliably). The
 *  fitted clip is persisted so it's reused on re-render + editable per-scene. */
async function uploadClipReliably(clipKey: string, buf: Buffer): Promise<void> {
  let uploadErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await putObject(clipKey, buf, "video/mp4");
      return;
    } catch (e) {
      uploadErr = e;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error(`Could not store clip in R2: ${(uploadErr as Error).message}`);
}

/** The motion prompt for a segment. When the user has NOT set a motion direction we
 *  use a rich default that prescribes pleasant ambient motion (drifting light, moving
 *  clouds, swaying elements). When they HAVE, that boilerplate would FIGHT their intent
 *  (e.g. it asks for "moving clouds" while they asked for none), so we drop it and make
 *  their direction authoritative — the user decides what moves and what stays still. */
function buildMotionPrompt(job: VideoJobRow, seg: VideoSegment): string {
  // Keep the raw "@Name" in storage (so the editor highlights mentions), but strip
  // the "@" for the model so "@Rex wags his tail" reads as "Rex wags his tail".
  const dir = seg.motionDirection?.trim().replace(/@(?=[\p{L}\d])/gu, "");
  const textRule = seg.text
    ? `Keep the lyric text in the frame perfectly still, sharp and fully legible.`
    : ``;

  // User-directed: their words govern the motion; only add the non-negotiable
  // constraints (style, text legibility, no people). No prescribed clouds/swaying.
  if (dir) {
    return [
      `Animate this still image in the style: ${job.styleDescription}, following the motion direction below EXACTLY.`,
      `Motion direction: ${dir}.`,
      `Animate ONLY what the direction calls for. Anything it says should not move must stay completely still, and do not add any motion it does not mention.`,
      textRule,
      `Smooth, tasteful motion, no hard camera cuts. No warping of any text. No real recognizable people.`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  // Auto (no direction) — the original per-model defaults, unchanged.
  return job.model === "pro"
    ? `Cinematic camera motion that smoothly transforms the scene, in the style: ${job.styleDescription}. ` +
        `Keep any lyric text in the frame legible and stable; add no other text. No real recognizable people.`
    : [
        `Bring this scene to life with gentle, natural motion in the style: ${job.styleDescription}.`,
        seg.text
          ? `The whole scene moves softly — drifting light, moving clouds or traffic, swaying elements, soft parallax — like a short looping background film.`
          : `Soft ambient movement throughout — drifting light and atmosphere.`,
        textRule,
        `Smooth, tasteful motion, no hard camera cuts. No warping of any text. No real people.`,
      ].join(" ");
}

/** Generate ONE motion clip for a segment (animating its frame; for Cinematic also
 *  morphing into the next frame), fit it to the segment's window, persist it to R2
 *  (reusable + editable), and return the local fitted-clip filename. The per-model
 *  branches mirror runAnimated / runCinematic exactly. */
async function generateSegmentClip(
  job: VideoJobRow,
  seg: VideoSegment,
  segments: VideoSegment[],
  aspectRatio: AspectRatio,
  workDir: string,
  outName: string,
): Promise<string> {
  if (!seg.imageKey) throw new Error(`Scene ${seg.index} has no image to animate.`);
  const firstFrameUrl = await presignGet(seg.imageKey);
  const dur = seg.clipEnd - seg.clipStart;
  const prompt = buildMotionPrompt(job, seg);

  let raw: Buffer;
  let genDur: number;
  if (job.model === "pro") {
    // Cinematic: morph frame[i] → frame[i+1] (Seedance, or the permissive Kling
    // fallback). The next frame is the seamless boundary; both do flexible
    // durations on fal (Seedance 4–15s, Kling 3–15s) — generate valid, then
    // speedFit to the real length.
    const permissive = job.motionMode === "ai_permissive";
    const next = segments.find((s) => s.index === seg.index + 1);
    const lastFrameUrl = next?.imageKey ? await presignGet(next.imageKey) : undefined;
    genDur = permissive
      ? Math.min(15, Math.max(3, Math.ceil(dur)))
      : Math.min(CINEMATIC_MAX_SECONDS, Math.max(CINEMATIC_MIN_SECONDS, Math.ceil(dur)));
    raw = await generateMotionClip({
      route: permissive ? "cinematic_permissive" : "cinematic",
      prompt,
      firstFrameUrl,
      lastFrameUrl, // first→last morph (undefined on the final clip)
      aspectRatio,
      durationSeconds: genDur,
    });
  } else if (job.imageQuality === "lite") {
    // Living Scenes on the Lite tier: Seedance 1.5 Pro @480p silent
    // (4–12s clips; fitClipToDuration trims to the real window). The stitch
    // upscales 480p to the 1080p canvas.
    genDur = Math.min(LITE_CLIP_MAX_SECONDS, Math.max(LITE_CLIP_MIN_SECONDS, Math.ceil(dur)));
    raw = await generateMotionClip({
      route: "lite",
      prompt,
      firstFrameUrl,
      aspectRatio,
      durationSeconds: genDur,
    });
  } else {
    // Living Scenes: animate the single frame (Grok @720p), generated at ~the
    // segment's length and trimmed.
    genDur = Math.min(GROK_MAX_SECONDS, Math.max(GROK_MIN_SECONDS, Math.ceil(dur)));
    raw = await generateMotionClip({
      route: "normal",
      prompt,
      firstFrameUrl,
      aspectRatio,
      durationSeconds: genDur,
    });
  }

  const rawFile = path.join(workDir, `raw_${seg.index}.mp4`);
  await writeFile(rawFile, raw);
  if (job.model === "pro") {
    await speedFitClip({ workDir, inFile: rawFile, outName, targetSeconds: dur, sourceSeconds: genDur, aspectRatio });
  } else if (dur > genDur + 0.5) {
    // Grouped scenes can span far longer than the model's max clip — LOOP the
    // clip (ping-pong) to fill the window instead of freeze-framing the tail.
    const { w, h } = CANVAS[aspectRatio];
    await loopFillClip({ workDir, inFile: rawFile, outName, spanSeconds: dur, canvasW: w, canvasH: h });
  } else {
    await fitClipToDuration({ workDir, inFile: rawFile, outName, durationSeconds: dur, aspectRatio });
  }
  await rm(rawFile, { force: true });

  // Persist the fitted clip so it's reused on re-render + editable in the motion editor.
  const clipKey = `video/${job.songId}/${job.id}/clip_${seg.index}.mp4`;
  await uploadClipReliably(clipKey, await readFile(path.join(workDir, outName)));
  seg.clipKey = clipKey;
  seg.clipStatus = "ready";
  return outName;
}

/** Get a segment's motion clip into the workDir: download the stored clip when it's
 *  current (edit re-render), else generate it. Mirrors materializeFrame so autopilot
 *  and finalize share one path; stale/missing clips regenerate. */
async function materializeClip(
  job: VideoJobRow,
  seg: VideoSegment,
  segments: VideoSegment[],
  aspectRatio: AspectRatio,
  workDir: string,
  outName: string,
): Promise<string> {
  if (seg.clipStatus === "ready" && seg.clipKey) {
    const res = await fetch(await presignGet(seg.clipKey));
    if (res.ok) {
      await writeFile(path.join(workDir, outName), Buffer.from(await res.arrayBuffer()));
      return outName;
    }
    // The stored clip is gone — fall through and regenerate it.
  }
  return generateSegmentClip(job, seg, segments, aspectRatio, workDir, outName);
}

/** Motion editor: regenerate ONE segment's clip (optionally with an edited motion
 *  direction), persist it, and return the updated card. Throws on failure (the route
 *  then charges nothing). */
export async function regenerateSegmentClip(
  job: VideoJobRow,
  index: number,
  newMotionDirection?: string,
  loopSeconds?: number,
): Promise<ReviewSegment> {
  const segments = job.segments ?? [];
  const seg = segments.find((s) => s.index === index);
  if (!seg) throw new Error("Segment not found.");
  // Plates scenes generate their text-free base on demand (materializeFrame).
  if (!seg.imageKey && seg.textMode !== "plates") {
    throw new Error("This scene has no image to animate yet.");
  }
  if (newMotionDirection !== undefined) seg.motionDirection = newMotionDirection.trim() || null;
  if (loopSeconds !== undefined) seg.loopSeconds = loopSeconds;

  const aspectRatio = job.aspectRatio as AspectRatio;
  const workDir = path.join(os.tmpdir(), `syllary-clip-${job.id}-${index}`);
  try {
    await mkdir(workDir, { recursive: true });
    if (seg.textMode === "plates") {
      // Plates scenes regenerate ONLY the bare loop here — cheap fast motion
      // iteration; the lyrics are applied as a separate step (or at finalize).
      const elementCatalog = await loadSongElementRefs(job.songId, job.elementIds);
      // Ensures the text-free base exists (generates + persists imageKey on demand).
      await materializeFrame(job, seg, aspectRatio, workDir, elementCatalog);
      const { w, h } = CANVAS[aspectRatio];
      await materializeLoopClip({
        job,
        seg,
        aspectRatio,
        workDir,
        motionPrompt: buildMotionPrompt(job, seg),
        canvasW: w,
        canvasH: h,
      });
    } else {
      await generateSegmentClip(job, seg, segments, aspectRatio, workDir, `clip_${index}.mp4`);
    }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }

  // Slow work done — merge the result into the CURRENT row under the lock (see
  // patchJobSegments) so parallel regens of other scenes aren't reverted.
  let updated: VideoSegment | undefined;
  await patchJobSegments(job.id, (fresh) => {
    const f = fresh.find((s) => s.index === index);
    if (!f) return;
    f.motionDirection = seg.motionDirection;
    f.clipKey = seg.clipKey;
    f.clipStatus = seg.clipStatus;
    if (seg.textMode === "plates") {
      f.imageKey = seg.imageKey; // base may have been generated on demand
      f.loopClipKey = seg.loopClipKey;
      f.platesApplied = seg.platesApplied;
      f.loopSeconds = seg.loopSeconds;
    }
    updated = f;
  });

  return toReviewSegment(updated ?? seg);
}

/** Apply the lyric plates to a plates scene's already-generated loop (missing
 *  stickers are generated + QC'd; existing ones are reused for free). The cheap
 *  half of the split flow — no motion model call. Throws on failure (the route
 *  then charges nothing). */
export async function regenerateSegmentPlates(
  job: VideoJobRow,
  index: number,
): Promise<ReviewSegment> {
  const segments = job.segments ?? [];
  const seg = segments.find((s) => s.index === index);
  if (!seg) throw new Error("Segment not found.");
  if (seg.textMode !== "plates") throw new Error("This scene doesn't use lyric plates.");
  if (!seg.loopClipKey) throw new Error("Generate this scene's loop first.");

  const aspectRatio = job.aspectRatio as AspectRatio;
  const workDir = path.join(os.tmpdir(), `syllary-plates-${job.id}-${index}`);
  try {
    await mkdir(workDir, { recursive: true });
    const { w, h } = CANVAS[aspectRatio];
    await applyPlatesToLoop({
      job,
      seg,
      aspectRatio,
      workDir,
      canvasW: w,
      canvasH: h,
      outName: `clip_${index}.mp4`,
    });
  } catch (err) {
    // A transient queue stall can leave SOME plates finished (they're already
    // uploaded) — persist those keys so the retry reuses them for free instead
    // of regenerating, then let the route report the failure (nothing charged).
    await patchJobSegments(job.id, (fresh) => {
      const f = fresh.find((s) => s.index === index);
      if (!f || !seg.lines) return;
      f.lines = seg.lines.map((l) => ({ ...l }));
    }).catch(() => undefined);
    throw err;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }

  let updated: VideoSegment | undefined;
  await patchJobSegments(job.id, (fresh) => {
    const f = fresh.find((s) => s.index === index);
    if (!f) return;
    f.clipKey = seg.clipKey;
    f.clipStatus = seg.clipStatus;
    f.textMode = seg.textMode; // may have flipped to "overlay" on QC failure
    f.platesApplied = seg.platesApplied;
    if (seg.lines) f.lines = seg.lines.map((l) => ({ ...l }));
    updated = f;
  });

  return toReviewSegment(updated ?? seg);
}

async function downloadAudio(r2Key: string, workDir: string): Promise<string> {
  const t = Date.now();
  const audioUrl = await presignGet(r2Key);
  const res = await fetch(audioUrl);
  if (!res.ok) throw new Error(`Could not fetch source audio (HTTP ${res.status}).`);
  const ext = path.extname(r2Key) || ".mp3";
  const audioFile = path.join(workDir, `audio${ext}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(audioFile, buf);
  console.log(`[audio] download ms=${Date.now() - t} bytes=${buf.length}`);
  return audioFile;
}

async function finalize(job: VideoJobRow, outFile: string): Promise<void> {
  const mp4 = await readFile(outFile);
  const videoKey = `video/${job.songId}/${job.id}/lyrics.mp4`;
  const tUp = Date.now();
  await putObject(videoKey, mp4, "video/mp4");
  console.log(`[finalize] upload ms=${Date.now() - tUp} mp4MB=${(mp4.length / 1e6).toFixed(1)}`);
  await db
    .update(videoJobs)
    .set({ status: "ready", videoKey, updatedAt: new Date() })
    .where(eq(videoJobs.id, job.id));
  // Save this style's video (one row per song+style; replaces a prior render —
  // a later full render overwrites a preview row, flipping isPreview back off).
  const sceneGrouping = grouping(job);
  await db
    .insert(songVideos)
    .values({ songId: job.songId, model: job.model, videoKey, isPreview: job.isPreview, sceneGrouping })
    .onConflictDoUpdate({
      target: [songVideos.songId, songVideos.model],
      set: { videoKey, isPreview: job.isPreview, sceneGrouping, updatedAt: new Date() },
    });
  // A finished video is NOT made public automatically — the user explicitly
  // chooses which style (if any) appears on their public page from the video
  // tabs. We only track the latest rendered key here.
  await db
    .update(songs)
    .set({ latestVideoKey: videoKey, updatedAt: new Date() })
    .where(eq(songs.id, job.songId));
  void captureForUserId(job.userId, "video_completed", {
    song_id: job.songId,
    style: job.model,
    preview: job.isPreview,
    render_seconds: Math.round((Date.now() - job.createdAt.getTime()) / 1000),
  });
}

// ---------------------------------------------------------------------------
// Style 1 — Slideshow: still Nano Banana frames + ffmpeg Ken-Burns motion.
// ---------------------------------------------------------------------------
async function runSlideshow(
  job: VideoJobRow,
  audioR2Key: string,
  segments: VideoSegment[],
  aspectRatio: AspectRatio,
  workDir: string,
  elementCatalog: ElementRef[],
  audioStartSeconds = 0,
): Promise<void> {
  console.log(
    `[slideshow] START job=${job.id} scenes=${segments.length} imageSize=${job.imageSize}` +
      ` quality=${job.imageQuality} reuse=${job.reuseFrames}`,
  );
  const stitch: StitchSegment[] = new Array(segments.length);
  console.log(`[slideshow] materialize START — ${segments.length} frames @ concurrency ${IMAGE_CONCURRENCY}`);
  const tMat = Date.now();
  await mapPool(segments, IMAGE_CONCURRENCY, async (seg) => {
    const { imageFile } = await materializeFrame(job, seg, aspectRatio, workDir, elementCatalog);
    seg.status = "done";
    stitch[seg.index] = {
      index: seg.index,
      imageFile,
      clipStart: seg.clipStart,
      clipEnd: seg.clipEnd,
    };
    await bumpProgress(job.id, segments);
  });
  const materializeMs = Date.now() - tMat;
  console.log(`[slideshow] materialize DONE ms=${materializeMs}`);

  const audioFile = await downloadAudio(audioR2Key, workDir);
  const outFile = path.join(workDir, "lyrics.mp4");
  console.log(`[slideshow] stitch START`);
  const tStitch = Date.now();
  await stitchLyricsVideo({ workDir, segments: stitch, audioFile, aspectRatio, outFile, audioStartSeconds });
  const stitchMs = Date.now() - tStitch;

  // Phase breakdown: materialize = pulling the approved frames from R2,
  // stitch = the ffmpeg work, finalize = uploading the MP4 back to R2.
  console.log(`[slideshow] finalize/upload START`);
  const tFin = Date.now();
  await finalize(job, outFile);
  const finalizeMs = Date.now() - tFin;
  console.log(
    `[slideshow] DONE job=${job.id} scenes=${segments.length} materializeMs=${materializeMs}` +
      ` stitchMs=${stitchMs} finalizeMs=${finalizeMs} totalMs=${materializeMs + stitchMs + finalizeMs}`,
  );
}

// ---------------------------------------------------------------------------
// Style 3 — Living Scenes: per-segment Nano frame → Grok image-to-video (the
// whole scene moves). Each clip is generated at its segment's own length.
// ---------------------------------------------------------------------------
async function runAnimated(
  job: VideoJobRow,
  audioR2Key: string,
  segments: VideoSegment[],
  aspectRatio: AspectRatio,
  workDir: string,
  elementCatalog: ElementRef[],
  audioStartSeconds = 0,
): Promise<void> {
  // Interleave image + clip per worker so progress moves from the FIRST finished
  // clip. materializeClip reuses a stored clip (edit re-render) or generates +
  // persists one (autopilot / stale clip), so this single loop serves both. mapPool's
  // concurrency cap (VIDEO_CONCURRENCY) naturally bounds the image burst.
  const { w: canvasW, h: canvasH } = CANVAS[aspectRatio];
  const clipNames = new Array<string>(segments.length);
  await mapPool(segments, VIDEO_CONCURRENCY, async (seg, i) => {
    const { imageFile } = await materializeFrame(job, seg, aspectRatio, workDir, elementCatalog);
    const clipName = `clip_${i}.mp4`;
    if (
      seg.textMode === "plates" &&
      (seg.clipStatus !== "ready" || !seg.clipKey || seg.platesApplied === false)
    ) {
      // Shared-clip scene: one loop + per-line typography plates (or the overlay
      // fallback). An existing loop is REUSED (platesApplied=false = the user
      // generated the motion in review but never applied the lyrics) — only the
      // plates + composite run here.
      await materializePlatesClip({
        job,
        seg,
        aspectRatio,
        workDir,
        motionPrompt: buildMotionPrompt(job, seg),
        canvasW,
        canvasH,
        outName: clipName,
      });
    } else {
      await materializeClip(job, seg, segments, aspectRatio, workDir, clipName);
    }
    clipNames[i] = clipName;
    // The local frame copy isn't needed (the model fetched it by R2 URL).
    await rm(imageFile, { force: true });
    seg.status = "done";
    await bumpProgress(job.id, segments);
  });

  await concatClips(workDir, clipNames, "concat.mp4");
  await Promise.all(clipNames.filter(Boolean).map((c) => rm(path.join(workDir, c), { force: true })));
  const audioFile = await downloadAudio(audioR2Key, workDir);
  const total = Math.max(...segments.map((s) => s.clipEnd));
  // Scenes that fell back to "overlay" (plates QC double-fail) get their lines
  // burned as timed subtitles here — same machinery as grouped Cinematic.
  const cues = overlayCues(segments);
  const outFile =
    cues.length > 0
      ? await overlayLyricsAndMux({
          workDir,
          videoName: "concat.mp4",
          audioFile,
          cues,
          aspectRatio,
          outName: "lyrics.mp4",
          maxSeconds: total,
          audioStartSeconds,
        })
      : await muxAudio({
          workDir,
          videoName: "concat.mp4",
          audioFile,
          outName: "lyrics.mp4",
          maxSeconds: total,
          audioStartSeconds,
        });
  await rm(path.join(workDir, "concat.mp4"), { force: true });
  await finalize(job, outFile);
}

/** Canvas dimensions per aspect (mirrors ffmpeg.ts DIMENSIONS). */
const CANVAS: Record<AspectRatio, { w: number; h: number }> = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
};

// ---------------------------------------------------------------------------
// Style 3 — Cinematic: exactly like Living Scenes (a per-line Nano frame that
// evokes the line, with its lyric embedded), EXCEPT each clip also gets the
// NEXT line's frame as its last frame. The model morphs frame[i] → frame[i+1],
// and because clip i's last frame IS clip i+1's first frame, the shots flow as
// one continuous, scene-changing take. Crisp ffmpeg subtitles are overlaid too.
// ---------------------------------------------------------------------------
async function runCinematic(
  job: VideoJobRow,
  audioR2Key: string,
  segments: VideoSegment[],
  aspectRatio: AspectRatio,
  workDir: string,
  elementCatalog: ElementRef[],
  audioStartSeconds = 0,
): Promise<void> {
  // 1. Materialize every frame FIRST — Cinematic morphs frame[i] → frame[i+1], so
  //    generating clip[i] needs frame[i+1] present. Local copies aren't needed (the
  //    model fetches each frame by its R2 URL); we only ensure the imageKeys exist.
  await mapPool(segments, IMAGE_CONCURRENCY, async (seg) => {
    const { imageFile } = await materializeFrame(job, seg, aspectRatio, workDir, elementCatalog);
    await rm(imageFile, { force: true });
  });

  // 2. Per line, reuse the stored clip or (re)generate it. The frame[i] → frame[i+1]
  //    morph (and the Seedance/Kling-permissive model choice) lives in
  //    generateSegmentClip. Clips are independent (frames precomputed) → concurrent.
  const clipNames = new Array<string>(segments.length);
  await mapPool(segments, VIDEO_CONCURRENCY, async (seg, i) => {
    const clipName = `clip_${i}.mp4`;
    await materializeClip(job, seg, segments, aspectRatio, workDir, clipName);
    clipNames[i] = clipName;
    await bumpProgress(job.id, segments);
  });

  await concatClips(workDir, clipNames, "concat.mp4");
  await Promise.all(clipNames.filter(Boolean).map((c) => rm(path.join(workDir, c), { force: true })));
  const audioFile = await downloadAudio(audioR2Key, workDir);
  const total = Math.max(...segments.map((s) => s.clipEnd));
  // Ungrouped ("line") Cinematic bakes the lyric into each frame → just mux.
  // GROUPED Cinematic renders text-free frames (a whole baked stanza would warp
  // beyond reading in the morph) and burns crisp per-line ASS cues here instead.
  const cues = overlayCues(segments);
  const outFile =
    cues.length > 0
      ? await overlayLyricsAndMux({
          workDir,
          videoName: "concat.mp4",
          audioFile,
          cues,
          aspectRatio,
          outName: "lyrics.mp4",
          maxSeconds: total,
          audioStartSeconds,
        })
      : await muxAudio({
          workDir,
          videoName: "concat.mp4",
          audioFile,
          outName: "lyrics.mp4",
          maxSeconds: total,
          audioStartSeconds,
        });
  await rm(path.join(workDir, "concat.mp4"), { force: true });
  await finalize(job, outFile);
}

/** Per-line subtitle cues for every "overlay" scene (grouped Cinematic + the
 *  plates fallback). Baked scenes contribute none. Line times are already in
 *  video time (previews shift them; full renders start at t=0). */
function overlayCues(segments: VideoSegment[]): LyricCue[] {
  return segments.flatMap((s) => {
    if (s.textMode !== "overlay" || !s.text) return [];
    return (
      s.lines?.map((l) => ({ text: l.text, start: l.start, end: l.end })) ?? [
        { text: s.text, start: s.start, end: s.end },
      ]
    );
  });
}

/** Dispatch the clip+stitch assembly for a style (frames are generated or
 *  downloaded inside each run* via materializeFrame). */
async function assembleForMode(
  job: VideoJobRow,
  audioR2Key: string,
  segments: VideoSegment[],
  aspectRatio: AspectRatio,
  workDir: string,
  elementCatalog: ElementRef[],
  audioStartSeconds = 0,
): Promise<void> {
  if (job.model === "normal") {
    await runAnimated(job, audioR2Key, segments, aspectRatio, workDir, elementCatalog, audioStartSeconds);
  } else if (job.model === "pro") {
    await runCinematic(job, audioR2Key, segments, aspectRatio, workDir, elementCatalog, audioStartSeconds);
  } else {
    await runSlideshow(job, audioR2Key, segments, aspectRatio, workDir, elementCatalog, audioStartSeconds);
  }
}

// ---------------------------------------------------------------------------
// Manual mode, phase 1 — generate every per-line image (with its prompt), then
// stop at "review" so the owner can inspect/regenerate before assembling.
// ---------------------------------------------------------------------------
async function runManualImages(
  job: VideoJobRow,
  segments: VideoSegment[],
  aspectRatio: AspectRatio,
  workDir: string,
  elementCatalog: ElementRef[],
): Promise<void> {
  await mapPool(segments, IMAGE_CONCURRENCY, async (seg) => {
    await makeFrame(job, seg, aspectRatio, workDir, elementCatalog);
    seg.status = "done";
    await bumpProgress(job.id, segments);
  });
  await db
    .update(videoJobs)
    .set({ status: "review", segments, updatedAt: new Date() })
    .where(eq(videoJobs.id, job.id));
}

/**
 * Run a lyric-video job end-to-end, dispatching by style. Fired and forgotten
 * from the create route; never throws (failures mark the job failed + refund).
 * The AI-video styles (Living Scenes, Cinematic) render only a short preview
 * window for now to control spend. Manual mode stops after the images (review).
 */
export async function runVideoPipeline(jobId: string): Promise<void> {
  const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, jobId)).limit(1);
  if (!job) return;

  const [song] = await db.select().from(songs).where(eq(songs.id, job.songId)).limit(1);
  if (!song || !song.lyrics) {
    await failJob(job, "Song has no lyrics to render.");
    return;
  }

  // One-time art brief (who/what the song is really about) so per-line images
  // depict the right subject/POV — e.g. a dog, not a person. Falls back to the
  // existing song summary, then to nothing; never blocks generation.
  // NOTE: only auto-derive when the brief was never set (null). An EMPTY string
  // means the user explicitly chose "no song context" — honor it, don't override.
  if (job.sceneBrief === null) {
    let brief = "";
    try {
      brief = await videoArtBrief(
        song.lyrics.lines.map((l) => l.text),
        job.styleDescription,
      );
    } catch {
      brief = "";
    }
    brief = brief || song.insights?.summary || "";
    if (brief) {
      await db
        .update(videoJobs)
        .set({ sceneBrief: brief, updatedAt: new Date() })
        .where(eq(videoJobs.id, job.id));
      job.sceneBrief = brief;
    }
  }

  const aspectRatio = job.aspectRatio as AspectRatio;
  let segments: VideoSegment[];
  let audioStartSeconds = 0;
  if (job.reuseFrames && job.segments && job.segments.length > 0) {
    // Seeded with another style's frames: trust the persisted timeline + imageKeys
    // (the source's deterministic full-song buildSegments output). No rebuild and
    // no cap — materializeFrame downloads each imageKey instead of regenerating.
    // NOTE: safe only while every model has previewSeconds = null (no capping);
    // revisit if any style starts rendering a capped window.
    segments = job.segments;
  } else if (job.isPreview) {
    // A ~10s sample starting at the first lyric line (audio seeked to match).
    const preview = buildPreviewSegments(song.lyrics, song.durationSeconds, grouping(job));
    segments = preview.segments;
    audioStartSeconds = preview.audioStartSeconds;
  } else {
    // Each style renders a capped window when one is set (none today = full song).
    const cap = VIDEO_MODEL_INFO[job.model].previewSeconds;
    segments = buildSegments(song.lyrics, song.durationSeconds, grouping(job));
    if (cap != null) segments = capForPreview(segments, cap);
  }
  if (segments.length === 0) {
    await failJob(job, "No lyric lines to render.");
    return;
  }
  stampTextModes(job, segments);

  // Every style now renders one clip per segment.
  const totalSegments = segments.length;
  await db
    .update(videoJobs)
    .set({ status: "processing", totalSegments, completedSegments: 0, segments, updatedAt: new Date() })
    .where(eq(videoJobs.id, job.id));

  // The song's elements (mention-driven references), resolved per frame.
  const elementCatalog = await loadSongElementRefs(job.songId, job.elementIds);
  const workDir = path.join(os.tmpdir(), `syllary-video-${job.id}`);
  try {
    await mkdir(workDir, { recursive: true });
    if (job.mode === "manual" && !job.isPreview) {
      if (!job.prerenderImages || job.reuseFrames) {
        // No pre-render (pay-per-scene) OR reuse (the frames already exist): jump
        // straight to review with the current segments — the user generates or
        // reuses each image, then finalizes.
        await db
          .update(videoJobs)
          .set({ status: "review", segments, updatedAt: new Date() })
          .where(eq(videoJobs.id, job.id));
      } else {
        // Pre-render every image, then stop at review.
        await runManualImages(job, segments, aspectRatio, workDir, elementCatalog);
      }
    } else {
      // Autopilot (and all previews): generate + assemble in one go.
      await assembleForMode(job, song.r2Key, segments, aspectRatio, workDir, elementCatalog, audioStartSeconds);
    }
  } catch (err) {
    await failJob(job, (err as Error).message?.slice(0, 500) ?? "Video generation failed.");
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Finalize a manual job: the per-line images already exist (in R2). Assemble the
 * clips + stitch for the chosen style using those approved frames. Fired and
 * forgotten from the finalize route; never throws.
 */
export async function finalizeVideoJob(jobId: string): Promise<void> {
  // The route has already claimed the job (review → processing) before calling.
  const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, jobId)).limit(1);
  if (!job) return;

  const [song] = await db.select().from(songs).where(eq(songs.id, job.songId)).limit(1);
  if (!song) {
    await failJob(job, "Song not found.");
    return;
  }
  const segments = job.segments ?? [];
  if (segments.length === 0) {
    await failJob(job, "No segments to assemble.");
    return;
  }

  const aspectRatio = job.aspectRatio as AspectRatio;
  const elementCatalog = await loadSongElementRefs(job.songId, job.elementIds);
  const workDir = path.join(os.tmpdir(), `syllary-video-${job.id}-final`);
  try {
    await mkdir(workDir, { recursive: true });
    await assembleForMode(job, song.r2Key, segments, aspectRatio, workDir, elementCatalog);
  } catch (err) {
    await failJob(job, (err as Error).message?.slice(0, 500) ?? "Video assembly failed.");
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
