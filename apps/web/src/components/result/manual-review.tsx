import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Clapperboard,
  Loader2,
  Music,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { type ReviewSegment, singleImageTokens, type VideoJob } from "@syllary/shared";
import { ApiError, finalizeVideoJob, regenerateSegment, updateVideoJob } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Button3D } from "@/components/ui/button-3d";
import { cn } from "@/lib/utils";

const FIELD =
  "mt-1.5 w-full resize-none rounded-[10px] border border-white/10 bg-black/30 px-3 py-2 text-[12px] leading-relaxed text-white/85 outline-none transition-colors placeholder:text-white/30 focus:border-pulse/60 focus:bg-pulse/[0.04] disabled:opacity-50";

/** Manual-mode review: a card per scene. The art-direction STYLE and the song
 *  CONTEXT are shared across every scene (edited once, collapsed by default);
 *  only the per-scene DIRECTION — what this frame depicts — changes from card to
 *  card. The lyric line is rendered into the image as typography regardless. */
export function ManualReview({
  job,
  onSegmentUpdated,
  onJobUpdated,
  onFinalized,
}: {
  job: VideoJob;
  /** Merge a regenerated segment back into the live job. */
  onSegmentUpdated: (segment: ReviewSegment) => void;
  /** Replace the live job after a shared-field edit. */
  onJobUpdated: (job: VideoJob) => void;
  /** Hand off the now-processing job so the parent resumes polling. */
  onFinalized: (job: VideoJob) => void;
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

  const seg = segments[index];
  const cost = singleImageTokens(job.imageQuality, job.imageSize);
  const isLast = index >= segments.length - 1;

  // Load the per-scene direction for whichever card we land on.
  useEffect(() => {
    setDirection(segments[index]?.direction ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

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
      const updated = await regenerateSegment(job.id, current.index, direction.trim());
      onSegmentUpdated(updated);
      setDirection(updated.direction ?? "");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't regenerate this scene.", "error");
    } finally {
      setRegenBusy(false);
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

  const busy = regenBusy || finalizing;

  return (
    <div className="mt-3">
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
                  <textarea
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
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

      <div className="relative overflow-hidden rounded-[16px] border border-white/[0.08] bg-gradient-to-br from-pulse/[0.05] to-transparent p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[1px] text-white/40">
            Scene {index + 1} of {segments.length}
          </span>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-white/55">
            Regenerate · {cost} tokens
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

            {/* Image (loading overlay while regenerating) */}
            <div className="relative aspect-video w-full overflow-hidden rounded-[12px] border border-white/10 bg-black">
              {seg.imageUrl && (
                <img
                  key={seg.imageUrl}
                  src={seg.imageUrl}
                  alt={seg.text || "Instrumental scene"}
                  className={cn(
                    "h-full w-full object-cover transition-opacity duration-300",
                    regenBusy && "opacity-30",
                  )}
                />
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
                  <span className="text-[12px] text-white/70">Repainting this scene…</span>
                </div>
              )}
            </div>

            {/* Per-scene direction — the only field that usually changes. */}
            <div className="mt-3">
              <span className="text-[11px] uppercase tracking-[0.5px] text-white/35">
                Direction — what to show in this scene
              </span>
              <textarea
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                rows={2}
                disabled={regenBusy}
                placeholder={
                  seg.text.trim()
                    ? `e.g. “a girl walking away” — leave blank to use the lyric line`
                    : `Describe this instrumental scene`
                }
                className={FIELD}
              />
            </div>
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
              onClick={() => void regenerate()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[12px] text-white/80 transition-colors hover:border-pulse/50 hover:text-white disabled:opacity-50"
            >
              {regenBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-pulse" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 text-pulse" />
              )}
              Regenerate
            </button>
          </div>

          {isLast ? (
            <Button3D disabled={busy} onClick={() => void finalize()}>
              {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
              Generate Full Video
            </Button3D>
          ) : (
            <Button3D disabled={busy} onClick={() => go(1)}>
              Next
              <ArrowRight className="h-4 w-4" />
            </Button3D>
          )}
        </div>
      </div>
    </div>
  );
}
