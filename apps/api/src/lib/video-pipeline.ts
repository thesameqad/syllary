import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import {
  type AspectRatio,
  buildPreviewSegments,
  buildSegments,
  capForPreview,
  CINEMATIC_MAX_SECONDS,
  CINEMATIC_MIN_SECONDS,
  GROK_MAX_SECONDS,
  GROK_MIN_SECONDS,
  type ImageQuality,
  type ImageSize,
  type ReviewSegment,
  VIDEO_MODEL_INFO,
  type VideoSegment,
} from "@syllary/shared";
import { db } from "../db/client.js";
import { songs, songVideos, users, videoJobs, type VideoJobRow } from "../db/schema.js";
import { buildBackdropPrompt, generateBackdrop } from "./openrouter-image.js";
import { videoArtBrief } from "./openrouter.js";
import { generateMotionClip } from "./openrouter-video.js";
import {
  concatClips,
  fitClipToDuration,
  muxAudio,
  speedFitClip,
  stitchLyricsVideo,
  type StitchSegment,
} from "./ffmpeg.js";
import { env } from "../env.js";
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
}

async function bumpProgress(jobId: string, segments: VideoSegment[]): Promise<void> {
  await db
    .update(videoJobs)
    .set({ completedSegments: sql`${videoJobs.completedSegments} + 1`, segments, updatedAt: new Date() })
    .where(eq(videoJobs.id, jobId));
}

/** Generate one Nano Banana frame for a segment, save it locally + to R2, and
 *  return a presigned URL (video models need a remote image URL). */
async function makeFrame(
  job: VideoJobRow,
  seg: VideoSegment,
  aspectRatio: AspectRatio,
  workDir: string,
  renderText = true,
): Promise<{ imageFile: string; imageUrl: string }> {
  // Persist the exact prompt sent (manual mode shows + lets the user edit it).
  // A stored prompt (e.g. an edited one on regenerate) takes precedence.
  const prompt =
    seg.prompt ??
    buildBackdropPrompt(job.styleDescription, seg.text, aspectRatio, renderText, job.sceneBrief ?? undefined);
  seg.prompt = prompt;
  const buf = await generateBackdrop({
    style: job.styleDescription,
    lineText: seg.text,
    aspectRatio,
    imageSize: job.imageSize as ImageSize,
    quality: job.imageQuality as ImageQuality,
    renderText,
    promptOverride: prompt,
  });
  const imageFile = path.join(workDir, `img_${seg.index}.png`);
  await writeFile(imageFile, buf);
  const imageKey = `video/${job.songId}/${job.id}/img_${seg.index}.png`;
  await uploadImageReliably(imageKey, buf);
  seg.imageKey = imageKey;
  return { imageFile, imageUrl: await presignGet(imageKey) };
}

/** Upload a frame to R2 with retries. Not best-effort: the AI-video styles feed
 *  the resulting presigned URL to the model, so a silently-failed upload would
 *  yield a dead URL ("Image URL could not be fetched"). */
async function uploadImageReliably(imageKey: string, buf: Buffer): Promise<void> {
  let uploadErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await putObject(imageKey, buf, "image/png");
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
  newPrompt?: string,
): Promise<ReviewSegment> {
  const segments = job.segments ?? [];
  const seg = segments.find((s) => s.index === index);
  if (!seg) throw new Error("Segment not found.");

  const aspectRatio = job.aspectRatio as AspectRatio;
  if (newPrompt && newPrompt.trim()) seg.prompt = newPrompt.trim();
  const prompt =
    seg.prompt ??
    buildBackdropPrompt(job.styleDescription, seg.text, aspectRatio, true, job.sceneBrief ?? undefined);
  seg.prompt = prompt;

  const buf = await generateBackdrop({
    style: job.styleDescription,
    lineText: seg.text,
    aspectRatio,
    imageSize: job.imageSize as ImageSize,
    quality: job.imageQuality as ImageQuality,
    renderText: true,
    promptOverride: prompt,
  });
  const imageKey = seg.imageKey ?? `video/${job.songId}/${job.id}/img_${seg.index}.png`;
  await uploadImageReliably(imageKey, buf);
  seg.imageKey = imageKey;
  seg.status = "done";

  await db
    .update(videoJobs)
    .set({ segments, updatedAt: new Date() })
    .where(eq(videoJobs.id, job.id));

  return {
    index: seg.index,
    text: seg.text,
    prompt: seg.prompt,
    status: seg.status,
    imageUrl: await presignGet(imageKey),
  };
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
): Promise<{ imageFile: string; imageUrl: string }> {
  if (seg.imageKey) {
    const imageUrl = await presignGet(seg.imageKey);
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Could not fetch frame ${seg.index} (HTTP ${res.status}).`);
    const imageFile = path.join(workDir, `img_${seg.index}.png`);
    await writeFile(imageFile, Buffer.from(await res.arrayBuffer()));
    return { imageFile, imageUrl };
  }
  return makeFrame(job, seg, aspectRatio, workDir);
}

async function downloadAudio(r2Key: string, workDir: string): Promise<string> {
  const audioUrl = await presignGet(r2Key);
  const res = await fetch(audioUrl);
  if (!res.ok) throw new Error(`Could not fetch source audio (HTTP ${res.status}).`);
  const ext = path.extname(r2Key) || ".mp3";
  const audioFile = path.join(workDir, `audio${ext}`);
  await writeFile(audioFile, Buffer.from(await res.arrayBuffer()));
  return audioFile;
}

async function finalize(job: VideoJobRow, outFile: string): Promise<void> {
  const mp4 = await readFile(outFile);
  const videoKey = `video/${job.songId}/${job.id}/lyrics.mp4`;
  await putObject(videoKey, mp4, "video/mp4");
  await db
    .update(videoJobs)
    .set({ status: "ready", videoKey, updatedAt: new Date() })
    .where(eq(videoJobs.id, job.id));
  // Save this style's video (one row per song+style; replaces a prior render —
  // a later full render overwrites a preview row, flipping isPreview back off).
  await db
    .insert(songVideos)
    .values({ songId: job.songId, model: job.model, videoKey, isPreview: job.isPreview })
    .onConflictDoUpdate({
      target: [songVideos.songId, songVideos.model],
      set: { videoKey, isPreview: job.isPreview, updatedAt: new Date() },
    });
  // Default the public page to the first FULL style the user generates — never a
  // preview (a preview shouldn't become the public video).
  await db
    .update(songs)
    .set({
      latestVideoKey: videoKey,
      publicVideoModel: job.isPreview
        ? sql`${songs.publicVideoModel}`
        : sql`coalesce(${songs.publicVideoModel}, ${job.model})`,
      updatedAt: new Date(),
    })
    .where(eq(songs.id, job.songId));
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
  audioStartSeconds = 0,
): Promise<void> {
  const stitch: StitchSegment[] = new Array(segments.length);
  await mapPool(segments, IMAGE_CONCURRENCY, async (seg) => {
    const { imageFile } = await materializeFrame(job, seg, aspectRatio, workDir);
    seg.status = "done";
    stitch[seg.index] = {
      index: seg.index,
      imageFile,
      clipStart: seg.clipStart,
      clipEnd: seg.clipEnd,
    };
    await bumpProgress(job.id, segments);
  });

  const audioFile = await downloadAudio(audioR2Key, workDir);
  const outFile = path.join(workDir, "lyrics.mp4");
  await stitchLyricsVideo({ workDir, segments: stitch, audioFile, aspectRatio, outFile, audioStartSeconds });
  await finalize(job, outFile);
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
  audioStartSeconds = 0,
): Promise<void> {
  const motionPrompt = (lineText: string) =>
    [
      `Bring this scene to life with gentle, natural motion in the style: ${job.styleDescription}.`,
      lineText
        ? `The whole scene moves softly — drifting light, moving clouds or traffic, swaying elements, soft parallax — like a short looping background film.`
        : `Soft ambient movement throughout — drifting light and atmosphere.`,
      lineText ? `Keep the lyric text in the frame perfectly still, sharp and fully legible.` : ``,
      `Smooth, tasteful motion, no hard camera cuts. No warping of any text. No real people.`,
    ].join(" ");

  // Interleave image + clip per worker so progress moves from the FIRST finished
  // clip — generating all frames up front left the bar at 0 ("stuck on the first
  // frame") for the whole image phase. mapPool's concurrency cap (VIDEO_CONCURRENCY)
  // naturally bounds the image burst (each worker does one image at a time).
  // The clip is generated at ~the segment's length and trimmed (no looping — that
  // replayed the clip start for ~1s, reading as a "restart" before the cut).
  const clipNames = new Array<string>(segments.length);
  await mapPool(segments, VIDEO_CONCURRENCY, async (seg, i) => {
    const { imageUrl } = await materializeFrame(job, seg, aspectRatio, workDir);
    const dur = seg.clipEnd - seg.clipStart;
    const genDur = Math.min(GROK_MAX_SECONDS, Math.max(GROK_MIN_SECONDS, Math.ceil(dur)));
    const raw = await generateMotionClip({
      model: env.OPENROUTER_VIDEO_MODEL,
      prompt: motionPrompt(seg.text),
      firstFrameUrl: imageUrl,
      aspectRatio,
      durationSeconds: genDur,
      resolution: "720p",
    });
    const rawFile = path.join(workDir, `raw_${i}.mp4`);
    await writeFile(rawFile, raw);
    const clipName = `clip_${i}.mp4`;
    await fitClipToDuration({ workDir, inFile: rawFile, outName: clipName, durationSeconds: dur, aspectRatio });
    clipNames[i] = clipName;
    seg.status = "done";
    await bumpProgress(job.id, segments);
  });

  await concatClips(workDir, clipNames, "concat.mp4");
  const audioFile = await downloadAudio(audioR2Key, workDir);
  const total = Math.max(...segments.map((s) => s.clipEnd));
  const outFile = await muxAudio({
    workDir,
    videoName: "concat.mp4",
    audioFile,
    outName: "lyrics.mp4",
    maxSeconds: total,
    audioStartSeconds,
  });
  await finalize(job, outFile);
}

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
  audioStartSeconds = 0,
): Promise<void> {
  const motionPrompt =
    `Cinematic camera motion that smoothly transforms the scene, in the style: ${job.styleDescription}. ` +
    `Keep any lyric text in the frame legible and stable; add no other text. No real recognizable people.`;

  // 1. One Nano frame per line (evokes the line + embeds its lyric) — concurrent.
  const frameUrls = await mapPool(segments, IMAGE_CONCURRENCY, async (seg) => {
    const { imageUrl } = await materializeFrame(job, seg, aspectRatio, workDir);
    return imageUrl;
  });

  // 2. Per line, morph frame[i] → frame[i+1]. Clips are independent (frames are
  //    precomputed) so this runs concurrently. The shared boundary frame makes
  //    consecutive clips join seamlessly.
  const clipNames = new Array<string>(segments.length);
  await mapPool(segments, VIDEO_CONCURRENCY, async (seg, i) => {
    const dur = seg.clipEnd - seg.clipStart;
    // Seedance only generates 4–15s clips, so generate at >=4s and then
    // speed-fit to the line's real length (preserves the first/last frames so
    // the seamless join survives even for short lines).
    const genDur = Math.min(CINEMATIC_MAX_SECONDS, Math.max(CINEMATIC_MIN_SECONDS, Math.ceil(dur)));
    const raw = await generateMotionClip({
      model: env.OPENROUTER_CINEMATIC_MODEL,
      prompt: motionPrompt,
      firstFrameUrl: frameUrls[i]!,
      lastFrameUrl: frameUrls[i + 1], // undefined on the final clip
      aspectRatio,
      durationSeconds: genDur,
      resolution: "480p",
    });
    const rawFile = path.join(workDir, `raw_${i}.mp4`);
    await writeFile(rawFile, raw);
    const clipName = `clip_${i}.mp4`;
    await speedFitClip({ workDir, inFile: rawFile, outName: clipName, targetSeconds: dur, sourceSeconds: genDur, aspectRatio });
    clipNames[i] = clipName;
    await bumpProgress(job.id, segments);
  });

  await concatClips(workDir, clipNames, "concat.mp4");
  const audioFile = await downloadAudio(audioR2Key, workDir);
  const total = Math.max(...segments.map((s) => s.clipEnd));
  // The lyric is already painted into each frame (and carried through the morph),
  // so we just mux the audio — no ffmpeg subtitle overlay.
  const outFile = await muxAudio({
    workDir,
    videoName: "concat.mp4",
    audioFile,
    outName: "lyrics.mp4",
    maxSeconds: total,
    audioStartSeconds,
  });
  await finalize(job, outFile);
}

/** Dispatch the clip+stitch assembly for a style (frames are generated or
 *  downloaded inside each run* via materializeFrame). */
async function assembleForMode(
  job: VideoJobRow,
  audioR2Key: string,
  segments: VideoSegment[],
  aspectRatio: AspectRatio,
  workDir: string,
  audioStartSeconds = 0,
): Promise<void> {
  if (job.model === "normal") {
    await runAnimated(job, audioR2Key, segments, aspectRatio, workDir, audioStartSeconds);
  } else if (job.model === "pro") {
    await runCinematic(job, audioR2Key, segments, aspectRatio, workDir, audioStartSeconds);
  } else {
    await runSlideshow(job, audioR2Key, segments, aspectRatio, workDir, audioStartSeconds);
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
): Promise<void> {
  await mapPool(segments, IMAGE_CONCURRENCY, async (seg) => {
    await makeFrame(job, seg, aspectRatio, workDir);
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
  if (!job.sceneBrief) {
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
  if (job.isPreview) {
    // A ~10s sample starting at the first lyric line (audio seeked to match).
    const preview = buildPreviewSegments(song.lyrics, song.durationSeconds);
    segments = preview.segments;
    audioStartSeconds = preview.audioStartSeconds;
  } else {
    // Each style renders a capped window when one is set (none today = full song).
    const cap = VIDEO_MODEL_INFO[job.model].previewSeconds;
    segments = buildSegments(song.lyrics, song.durationSeconds);
    if (cap != null) segments = capForPreview(segments, cap);
  }
  if (segments.length === 0) {
    await failJob(job, "No lyric lines to render.");
    return;
  }

  // Every style now renders one clip per segment.
  const totalSegments = segments.length;
  await db
    .update(videoJobs)
    .set({ status: "processing", totalSegments, completedSegments: 0, segments, updatedAt: new Date() })
    .where(eq(videoJobs.id, job.id));

  const workDir = path.join(os.tmpdir(), `syllary-video-${job.id}`);
  try {
    await mkdir(workDir, { recursive: true });
    if (job.mode === "manual" && !job.isPreview) {
      // Generate the images only; the user reviews + regenerates, then finalizes.
      await runManualImages(job, segments, aspectRatio, workDir);
    } else {
      // Autopilot (and all previews): generate + assemble in one go.
      await assembleForMode(job, song.r2Key, segments, aspectRatio, workDir, audioStartSeconds);
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
  const workDir = path.join(os.tmpdir(), `syllary-video-${job.id}-final`);
  try {
    await mkdir(workDir, { recursive: true });
    await assembleForMode(job, song.r2Key, segments, aspectRatio, workDir);
  } catch (err) {
    await failJob(job, (err as Error).message?.slice(0, 500) ?? "Video assembly failed.");
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
