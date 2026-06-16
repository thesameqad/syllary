import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  ChevronDown,
  Clapperboard,
  Film,
  Image as ImageIcon,
  Loader2,
  Music,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import {
  findMentionedNames,
  type ReviewSegment,
  singleClipTokens,
  singleImageTokens,
  type VideoJob,
} from "@syllary/shared";
import {
  ApiError,
  finalizeVideoJob,
  listElements,
  regenerateClip,
  regenerateSegment,
  updateSegment,
  updateVideoJob,
} from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Button3D } from "@/components/ui/button-3d";
import { MentionTextarea } from "@/components/ui/mention-textarea";
import { cn } from "@/lib/utils";

const FIELD =
  "mt-1.5 w-full resize-none rounded-[10px] border border-white/10 bg-black/30 px-3 py-2 text-[12px] leading-relaxed text-white/85 outline-none transition-colors placeholder:text-white/30 focus:border-pulse/60 focus:bg-pulse/[0.04] disabled:opacity-50";

/** What the motion field shows for a scene: the saved motion direction if there is
 *  one (it always wins), otherwise SEED it from the image's own subject — its
 *  direction, else the lyric line — so motion starts from what the frame depicts
 *  ("Victoria plays with Kitty in the park") instead of blank. The user can edit or
 *  clear it; an empty save means "default motion". */
function motionSeed(seg: ReviewSegment | undefined): string {
  if (seg?.motionDirection) return seg.motionDirection;
  return seg?.direction?.trim() || seg?.text || "";
}

/** Manual-mode review: a card per scene. The art-direction STYLE and the song
 *  CONTEXT are shared across every scene (edited once, collapsed by default);
 *  only the per-scene DIRECTION — what this frame depicts — changes from card to
 *  card. The lyric line is rendered into the image as typography regardless. */
export function ManualReview({
  job,
  audioUrl,
  onSegmentUpdated,
  onJobUpdated,
  onFinalized,
  onCancel,
  finalizeCost,
}: {
  job: VideoJob;
  /** The song's audio, so the motion editor can play a clip alongside its slice of
   *  the song. Null when the audio isn't available. */
  audioUrl?: string | null;
  /** Merge a regenerated segment back into the live job. */
  onSegmentUpdated: (segment: ReviewSegment) => void;
  /** Replace the live job after a shared-field edit. */
  onJobUpdated: (job: VideoJob) => void;
  /** Hand off the now-processing job so the parent resumes polling. */
  onFinalized: (job: VideoJob) => void;
  /** Edit mode only: discard this review without rendering (back to the existing
   *  video). When set, a "Discard edits" affordance + an "Editing" header show. */
  onCancel?: () => void;
  /** Edit mode only: token cost of the re-render, shown on the finalize button
   *  (the re-edit motion charge). Undefined for a first-time manual job (free). */
  finalizeCost?: number;
}) {
  const toast = useToast();
  const segments = job.segments;
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [direction, setDirection] = useState(segments[0]?.direction ?? "");
  const [sharedOpen, setSharedOpen] = useState(false);
  const [style, setStyle] = useState(job.styleDescription);
  const [context, setContext] = useState(job.sceneBrief ?? "");
  const [savingShared, setSavingShared] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [clipBusy, setClipBusy] = useState(false);
  // First-time manual: a two-step confirm before deleting the whole in-progress video.
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Image editor vs Motion editor (AI-motion styles only). Persists across scenes.
  const [mode, setMode] = useState<"image" | "motion">("image");
  const [motionDir, setMotionDir] = useState(motionSeed(segments[0]));
  // Per-scene "No one" — depict scenery/objects with no recurring subjects at all.
  const [noCast, setNoCast] = useState(segments[0]?.noCast ?? false);
  // The song's elements (mention-driven) — @mentionable in any scene alongside members.
  const [elementNames, setElementNames] = useState<string[]>([]);
  useEffect(() => {
    listElements(job.songId)
      .then((els) => setElementNames(els.filter((e) => e.imageUrl).map((e) => e.name)))
      .catch(() => undefined);
  }, [job.songId]);

  const seg = segments[index];
  const supportsMotion = job.model !== "fast";
  const cost = singleImageTokens(job.imageQuality, job.imageSize);
  const clipCost = singleClipTokens(job.model, (seg?.clipEnd ?? 0) - (seg?.clipStart ?? 0));
  const isLast = index >= segments.length - 1;
  const hasImage = !!seg?.imageUrl;
  const hasClip = !!seg?.clipUrl;
  // No-prerender scenes start blank — you can't advance past one until it has an
  // image (the action button reads "Generate" rather than "Regenerate" for these).
  const nextBlocked = !seg?.imageUrl;

  // Load the per-scene direction + motion direction for whichever card we land on.
  useEffect(() => {
    setDirection(segments[index]?.direction ?? "");
    setMotionDir(motionSeed(segments[index]));
    setNoCast(segments[index]?.noCast ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // @mentionable subjects: the job's band members + ALL the song's elements
  // (mention-driven — any element can be referenced without a "feature" step).
  const cast = Array.from(new Set([...(job.characterNames ?? []), ...elementNames]));
  const mentioned = cast.length > 0 ? findMentionedNames(direction, cast) : [];
  const motionMentioned = cast.length > 0 ? findMentionedNames(motionDir, cast) : [];

  // Append "@Name " to a field (no-op if already mentioned).
  function appendMention(value: string, name: string): string {
    if (findMentionedNames(value, [name]).length > 0) return value;
    const base = value.trimEnd();
    return `${base ? base + " " : ""}@${name} `;
  }
  // Append "@Name " to the image direction (no-op if already mentioned).
  function insertMention(name: string) {
    setNoCast(false); // adding someone cancels a "No one" scene
    setDirection((d) => appendMention(d, name));
  }
  // Append "@Name " to the MOTION direction (names who moves; the model gets it as
  // plain text, the @ stripped server-side).
  function insertMotionMention(name: string) {
    setMotionDir((d) => appendMention(d, name));
  }

  if (!seg) {
    return (
      <div className="mt-3 flex aspect-video w-full items-center justify-center rounded-[10px] border border-white/10 bg-black text-[13px] text-white/50">
        No scenes to review.
      </div>
    );
  }

  // Persist the job-wide shared fields (style + context) on blur, if changed.
  async function saveShared() {
    const nextStyle = style.trim();
    const styleChanged = nextStyle.length > 0 && nextStyle !== job.styleDescription;
    const contextChanged = context.trim() !== (job.sceneBrief ?? "").trim();
    if (!styleChanged && !contextChanged) return;
    setSavingShared(true);
    try {
      const updated = await updateVideoJob(job.id, {
        ...(styleChanged ? { styleDescription: nextStyle } : {}),
        ...(contextChanged ? { sceneBrief: context } : {}),
      });
      onJobUpdated(updated);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save those changes.", "error");
    } finally {
      setSavingShared(false);
    }
  }

  async function regenerate() {
    const current = segments[index];
    if (!current || regenBusy) return;
    setRegenBusy(true);
    try {
      // Persist any pending shared edits first so this scene picks them up.
      await saveShared();
      const updated = await regenerateSegment(job.id, current.index, direction.trim(), noCast);
      onSegmentUpdated(updated);
      setDirection(updated.direction ?? "");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't regenerate this scene.", "error");
    } finally {
      setRegenBusy(false);
    }
  }

  // Persist a motion-direction edit without regenerating, so a full re-render picks
  // it up (the server marks the stored clip stale). Saved on blur, like style/context.
  async function saveMotionDir() {
    const current = segments[index];
    if (!current) return;
    const next = motionDir.trim();
    if (next === (current.motionDirection ?? "").trim()) return;
    try {
      const updated = await updateSegment(job.id, current.index, { motionDirection: next || null });
      onSegmentUpdated(updated);
    } catch {
      // Best-effort — "Regenerate clip" also persists the direction.
    }
  }

  // Motion editor: regenerate just this scene's clip with the current motion direction.
  async function regenerateClipNow() {
    const current = segments[index];
    if (!current || clipBusy) return;
    setClipBusy(true);
    try {
      const updated = await regenerateClip(job.id, current.index, motionDir.trim());
      onSegmentUpdated(updated);
      setMotionDir(updated.motionDirection ?? "");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't regenerate this clip.", "error");
    } finally {
      setClipBusy(false);
    }
  }

  async function finalize() {
    setFinalizing(true);
    try {
      const updated = await finalizeVideoJob(job.id);
      onFinalized(updated);
    } catch (e) {
      setFinalizing(false);
      toast(e instanceof ApiError ? e.message : "Couldn't start the final video.", "error");
    }
  }

  const go = (delta: number) => {
    setDir(delta);
    setIndex((i) => Math.min(segments.length - 1, Math.max(0, i + delta)));
  };

  const busy = regenBusy || finalizing || clipBusy;

  return (
    <div className="mt-3">
      {/* Edit mode: a header that makes "you're editing an existing video" clear
          and offers an always-available way back out without re-rendering. */}
      {onCancel && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-[12px] border border-pulse/20 bg-pulse/[0.05] px-3.5 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-white/75">
            <Pencil className="h-3.5 w-3.5 text-pulse" />
            {job.isEdit
              ? "Editing this video — swap any scenes, then re-render"
              : "New video — build your scenes, then render it (or undo any time)"}
          </span>
          {job.isEdit ? (
            // Edit of a finished video: discarding is safe (the source video survives),
            // so it's one click, no confirm.
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/65 transition-colors hover:border-pulse/50 hover:text-white disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              Discard edits
            </button>
          ) : confirmCancel ? (
            // First-time manual: deleting throws away the whole in-progress video, so
            // confirm first.
            <span className="inline-flex shrink-0 items-center gap-2">
              <span className="text-[11px] text-white/60">Delete this video?</span>
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full border border-pulse/60 bg-pulse/15 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-pulse/25 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Yes, delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                disabled={busy}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/65 transition-colors hover:text-white disabled:opacity-50"
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/65 transition-colors hover:border-pulse/50 hover:text-white disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Undo &amp; delete
            </button>
          )}
        </div>
      )}

      {/* Shared style + context — applies to every scene, edited once. */}
      <div className="mb-3 overflow-hidden rounded-[12px] border border-white/[0.08] bg-white/[0.02]">
        <button
          type="button"
          onClick={() => setSharedOpen((o) => !o)}
          className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
        >
          <span className="inline-flex items-center gap-2 text-[12px] font-medium text-white/80">
            <SlidersHorizontal className="h-3.5 w-3.5 text-pulse" />
            Style &amp; context
            <span className="text-[11px] font-normal text-white/40">· applies to every scene</span>
          </span>
          <span className="inline-flex items-center gap-2">
            {savingShared && <Loader2 className="h-3.5 w-3.5 animate-spin text-pulse" />}
            <ChevronDown
              className={cn("h-4 w-4 text-white/40 transition-transform", sharedOpen && "rotate-180")}
            />
          </span>
        </button>
        <AnimatePresence initial={false}>
          {sharedOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="border-t border-white/[0.06] px-3.5 pb-3.5 pt-2">
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.5px] text-white/35">
                    Visual style
                  </span>
                  <textarea
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    onBlur={() => void saveShared()}
                    rows={2}
                    disabled={busy}
                    placeholder="e.g. moody cinematic neon, film grain, shallow depth of field"
                    className={FIELD}
                  />
                </label>
                <label className="mt-2.5 block">
                  <span className="text-[11px] uppercase tracking-[0.5px] text-white/35">
                    Song context
                  </span>
                  <MentionTextarea
                    value={context}
                    onChange={setContext}
                    names={cast}
                    onBlur={() => void saveShared()}
                    rows={2}
                    disabled={busy}
                    placeholder="What the song is about — the subject & point of view to depict"
                    className={FIELD}
                  />
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Progress dots */}
      <div className="mb-3 flex items-center justify-center gap-1.5">
        {segments.map((s, i) => (
          <button
            key={s.index}
            type="button"
            aria-label={`Scene ${i + 1}`}
            onClick={() => {
              setDir(i > index ? 1 : -1);
              setIndex(i);
            }}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === index ? "w-5 bg-pulse" : "w-1.5 bg-white/20 hover:bg-white/40",
            )}
          />
        ))}
      </div>

      {/* Image ⇄ Motion editor switch — only the AI-motion styles have clips. */}
      {supportsMotion && (
        <div className="mb-3 flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
            {(
              [
                { key: "image", label: "Image", Icon: ImageIcon },
                { key: "motion", label: "Motion", Icon: Film },
              ] as const
            ).map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors",
                  mode === key
                    ? "bg-pulse text-white shadow-[0_2px_12px_rgba(255,45,45,0.45)]"
                    : "text-white/55 hover:text-white",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative overflow-hidden rounded-[16px] border border-white/[0.08] bg-gradient-to-br from-pulse/[0.05] to-transparent p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[1px] text-white/40">
            Scene {index + 1} of {segments.length}
          </span>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-white/55">
            {mode === "motion"
              ? `${hasClip ? "Regenerate clip" : "Generate clip"} · ${clipCost} tokens`
              : `${hasImage ? "Regenerate" : "Generate"} · ${cost} tokens`}
          </span>
        </div>

        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={seg.index}
            custom={dir}
            initial={{ opacity: 0, x: dir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -40 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
          >
            {/* Lyric line */}
            <div className="mb-3 flex items-start gap-2">
              {seg.text.trim() ? (
                <p className="text-[18px] font-medium leading-snug tracking-[-0.4px] text-white">
                  “{seg.text}”
                </p>
              ) : (
                <p className="inline-flex items-center gap-1.5 text-[14px] text-white/55">
                  <Music className="h-4 w-4 text-pulse" />
                  Instrumental scene
                </p>
              )}
            </div>

            {mode === "motion" ? (
              <>
                {/* Motion clip — plays synced to this scene's slice of the song. */}
                <ClipPreview
                  clipUrl={seg.clipUrl}
                  audioUrl={audioUrl ?? null}
                  clipStart={seg.clipStart}
                  busy={clipBusy}
                />
                {seg.clipStatus === "stale" && !clipBusy && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400/[0.12] px-2.5 py-1 text-[11px] font-medium text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Out of date — image changed. Regenerate, or the re-render refreshes it.
                  </div>
                )}

                {/* Per-scene motion direction. */}
                <div className="mt-3">
                  <span className="text-[11px] uppercase tracking-[0.5px] text-white/35">
                    Motion — how this shot should move
                  </span>
                  <MentionTextarea
                    value={motionDir}
                    onChange={setMotionDir}
                    names={cast}
                    onBlur={() => void saveMotionDir()}
                    rows={2}
                    disabled={clipBusy}
                    placeholder={
                      job.model === "pro"
                        ? `e.g. “slow push-in, camera drifts left” — blank = default cinematic motion`
                        : `e.g. “leaves drift, gentle parallax” — blank = default motion`
                    }
                    className={FIELD}
                  />
                  {cast.length > 0 && (
                    <div className="mt-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {cast.map((name) => {
                          const active = motionMentioned.includes(name);
                          return (
                            <button
                              key={name}
                              type="button"
                              disabled={clipBusy}
                              onClick={() => insertMotionMention(name)}
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-50",
                                active
                                  ? "border-pulse/60 bg-pulse/[0.12] text-white"
                                  : "border-white/10 bg-white/[0.03] text-white/65 hover:border-pulse/50 hover:text-white",
                              )}
                            >
                              @{name}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 text-[11px] text-white/40">
                        Tap to name who moves in this shot (e.g. “@{cast[0]} waves”). They&apos;re already in
                        the frame — this only directs the motion.
                      </p>
                    </div>
                  )}
                  <p className="mt-1.5 text-[11px] text-white/40">
                    Fed to the {job.model === "pro" ? "Cinematic" : "Living Scenes"} motion model —
                    the still image isn&apos;t changed, only how it moves.
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* Image (loading overlay while regenerating) */}
                <div className="relative aspect-video w-full overflow-hidden rounded-[12px] border border-white/10 bg-black">
                  {seg.imageUrl ? (
                    <img
                      key={seg.imageUrl}
                      src={seg.imageUrl}
                      alt={seg.text || "Instrumental scene"}
                      className={cn(
                        "h-full w-full object-cover transition-opacity duration-300",
                        regenBusy && "opacity-30",
                      )}
                    />
                  ) : (
                    !regenBusy && (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
                        <ImageIcon className="h-7 w-7 text-white/25" />
                        <p className="text-[12.5px] text-white/55">No image yet</p>
                        <p className="max-w-[80%] text-[11px] text-white/35">
                          Write a direction below, then <span className="text-white/55">Generate</span> to
                          create this scene.
                        </p>
                      </div>
                    )
                  )}
                  {regenBusy && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
                        className="h-10 w-10 rounded-full"
                        style={{
                          background: "conic-gradient(from 0deg, #ff2d2d, transparent 70%)",
                          maskImage: "radial-gradient(closest-side, transparent 60%, #000 62%)",
                          WebkitMaskImage: "radial-gradient(closest-side, transparent 60%, #000 62%)",
                        }}
                      />
                      <span className="text-[12px] text-white/70">
                        {hasImage ? "Repainting this scene…" : "Painting this scene…"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Per-scene direction — the only field that usually changes. */}
                <div className="mt-3">
                  <span className="text-[11px] uppercase tracking-[0.5px] text-white/35">
                    Direction — what to show in this scene
                  </span>
                  <MentionTextarea
                    value={direction}
                    onChange={setDirection}
                    names={cast}
                    rows={2}
                    disabled={regenBusy}
                    placeholder={
                      seg.text.trim()
                        ? `e.g. “a girl walking away” — leave blank to use the lyric line`
                        : `Describe this instrumental scene`
                    }
                    className={FIELD}
                  />
                  {cast.length > 0 && (
                    <div className="mt-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          disabled={regenBusy}
                          onClick={() => setNoCast((v) => !v)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-50",
                            noCast
                              ? "border-pulse/60 bg-pulse/[0.12] text-white"
                              : "border-white/10 bg-white/[0.03] text-white/65 hover:border-pulse/50 hover:text-white",
                          )}
                        >
                          <Ban className="h-3 w-3" />
                          No one
                        </button>
                        {cast.map((name) => {
                          const active = !noCast && mentioned.includes(name);
                          return (
                            <button
                              key={name}
                              type="button"
                              disabled={regenBusy}
                              onClick={() => insertMention(name)}
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-50",
                                active
                                  ? "border-pulse/60 bg-pulse/[0.12] text-white"
                                  : "border-white/10 bg-white/[0.03] text-white/65 hover:border-pulse/50 hover:text-white",
                                noCast && "opacity-40",
                              )}
                            >
                              @{name}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 text-[11px] text-white/40">
                        {noCast
                          ? "No characters in this scene — scenery & objects only. Tap a name to add someone."
                          : `Tap a name to feature them (e.g. “@${cast[0]} gives flowers to ${cast[1] ? `@${cast[1]}` : "someone"}”). Mention nobody = the whole band; tap “No one” for a scene with no people.`}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Controls */}
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={index === 0 || busy}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-white/25 hover:text-white disabled:opacity-40"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <button
              type="button"
              onClick={() => void (mode === "motion" ? regenerateClipNow() : regenerate())}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[12px] text-white/80 transition-colors hover:border-pulse/50 hover:text-white disabled:opacity-50"
            >
              {(mode === "motion" ? clipBusy : regenBusy) ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-pulse" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 text-pulse" />
              )}
              {mode === "motion"
                ? hasClip
                  ? "Regenerate clip"
                  : "Generate clip"
                : hasImage
                  ? "Regenerate"
                  : "Generate"}
            </button>
          </div>

          {finalizeCost !== undefined ? (
            // Edit mode: re-render is reachable from any scene (no need to walk
            // every card just to swap one), with a small Next for convenience.
            <div className="flex items-center gap-2">
              {!isLast && (
                <button
                  type="button"
                  onClick={() => go(1)}
                  disabled={busy || nextBlocked}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-white/25 hover:text-white disabled:opacity-40"
                >
                  Next
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
              <Button3D disabled={busy} onClick={() => void finalize()}>
                {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
                Regenerate video · {finalizeCost} tokens
              </Button3D>
            </div>
          ) : isLast ? (
            <Button3D disabled={busy} onClick={() => void finalize()}>
              {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
              Generate Full Video
            </Button3D>
          ) : (
            <Button3D disabled={busy || nextBlocked} onClick={() => go(1)}>
              Next
              <ArrowRight className="h-4 w-4" />
            </Button3D>
          )}
        </div>
        {!isLast && nextBlocked && !busy && (
          <p className="mt-2.5 text-right text-[11px] text-white/45">
            Generate the image first by clicking{" "}
            <span className="text-white/70">Generate</span> to continue.
          </p>
        )}
      </div>
    </div>
  );
}

/** Motion-editor clip preview: plays the (silent) motion clip together with the
 *  song's audio seeked to this scene's window, so the user hears the lyric the
 *  shot belongs to. The fitted clip is exactly its scene length, so it ends on its
 *  own and we stop the audio with it — no separate timer needed. */
function ClipPreview({
  clipUrl,
  audioUrl,
  clipStart,
  busy,
}: {
  clipUrl: string | null;
  audioUrl: string | null;
  clipStart: number;
  busy: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  // Stop + reset whenever the clip changes (e.g. after a regenerate).
  useEffect(() => {
    setPlaying(false);
    videoRef.current?.pause();
    audioRef.current?.pause();
    if (videoRef.current) videoRef.current.currentTime = 0;
  }, [clipUrl]);

  async function toggle() {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      a?.pause();
      setPlaying(false);
      return;
    }
    v.currentTime = 0;
    if (a) {
      try {
        a.currentTime = clipStart;
      } catch {
        /* not seekable yet — it will start from where it can */
      }
    }
    setPlaying(true);
    try {
      await Promise.all([v.play(), a?.play() ?? Promise.resolve()]);
    } catch {
      /* autoplay/seek race — ignore */
    }
  }

  function stop() {
    audioRef.current?.pause();
    if (videoRef.current) videoRef.current.currentTime = 0;
    setPlaying(false);
  }

  // Idle with no clip → placeholder. While generating (even the FIRST clip, when
  // there's nothing underneath yet) the cool animation below shows instead.
  if (!clipUrl && !busy) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-white/15 bg-black/40 text-center">
        <Film className="h-7 w-7 text-white/30" />
        <p className="text-[12.5px] text-white/55">No motion clip yet</p>
        <p className="max-w-[80%] text-[11px] text-white/35">
          Generate to create &amp; preview this shot.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-[12px] border bg-black",
        busy ? "border-pulse/40" : "border-white/10",
      )}
    >
      {clipUrl && (
        <video
          ref={videoRef}
          key={clipUrl}
          src={clipUrl}
          muted
          playsInline
          onEnded={stop}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-300",
            busy && "opacity-20",
          )}
        />
      )}
      {clipUrl && audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" />}
      {busy ? (
        <ClipGenerating />
      ) : (
        <button
          type="button"
          onClick={() => void toggle()}
          className="group absolute inset-0 flex items-center justify-center transition-colors hover:bg-black/15"
          aria-label={playing ? "Pause" : "Play with music"}
        >
          <span className="flex items-center gap-2 rounded-full bg-pulse/90 px-4 py-2 text-[12px] font-medium text-white shadow-lg backdrop-blur transition-transform group-hover:scale-105">
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 translate-x-[1px]" />
            )}
            {playing ? "Pause" : "Play with music"}
          </span>
        </button>
      )}
    </div>
  );
}

/** The "a motion clip is being synthesized" animation — a pulsing red glow, a
 *  sweeping render light, and a film strip whose frames light up in a wave. Shown
 *  while a clip regenerates (over the dimmed old clip, or a black box for the
 *  first one). */
function ClipGenerating() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* breathing red glow */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 50% 50%, rgba(255,45,45,0.22), transparent 62%)",
        }}
        animate={{ opacity: [0.35, 0.9, 0.35] }}
        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
      />
      {/* sweeping render light */}
      <motion.div
        className="absolute inset-y-0 left-0 w-1/4 -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent"
        animate={{ x: ["-120%", "520%"] }}
        transition={{ repeat: Infinity, duration: 1.7, ease: "easeInOut" }}
      />
      {/* film strip — frames light up in a wave (the clip being assembled) */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="h-7 w-9 rounded-[3px] border bg-pulse/10"
              animate={{
                opacity: [0.25, 1, 0.25],
                scale: [0.9, 1.06, 0.9],
                borderColor: [
                  "rgba(255,45,45,0.25)",
                  "rgba(255,45,45,0.95)",
                  "rgba(255,45,45,0.25)",
                ],
                boxShadow: [
                  "0 0 0px rgba(255,45,45,0)",
                  "0 0 16px rgba(255,45,45,0.55)",
                  "0 0 0px rgba(255,45,45,0)",
                ],
              }}
              transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.13, ease: "easeInOut" }}
            />
          ))}
        </div>
        <motion.div
          className="flex items-center gap-2 text-[12.5px] font-medium text-white/85"
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
        >
          <Film className="h-4 w-4 text-pulse" />
          Animating this shot…
        </motion.div>
      </div>
    </div>
  );
}
