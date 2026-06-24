import { type ReactNode, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, ChevronDown, Clapperboard, Download, Globe, Loader2, Lock, Maximize2, Pencil, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import {
  canRemoveWatermark,
  estimateVideoCost,
  reRenderTokens,
  type ReviewSegment,
  VIDEO_DOWNLOAD_RESOLUTIONS,
  type VideoDownloadResolution,
  VIDEO_MODELS,
  VIDEO_MODEL_INFO,
  type Song,
  type VideoJob,
  type VideoModel,
} from "@syllary/shared";
import {
  ApiError,
  createVideoFromFrames,
  deleteSongVideo,
  discardVideoEdit,
  editVideo,
  generateFullVideo,
  getVideoJob,
  requestVideoDownload,
  setPublicVideo,
} from "@/lib/api";
import { useAccount } from "@/lib/account-context";
import { useToast } from "@/components/ui/toast";
import { Button3D } from "@/components/ui/button-3d";
import { Modal } from "@/components/ui/modal";
import { ManualReview } from "@/components/result/manual-review";
import { TheaterMode } from "@/components/result/theater-mode";
import { cn } from "@/lib/utils";

/** The Cinematic (Seedance) model rejected the frames as possibly a real person —
 *  worth offering a retry on the more permissive motion model. */
function isModerationError(raw: string | null | undefined): boolean {
  return !!raw && /real person|sensitive content|privacy|moderation/i.test(raw);
}

/** A "Make {style}" reuse action as one split-dropdown button: the trigger opens a
 *  menu to pick Automatic (render the whole thing now) or Manual (open the frames in
 *  the editor first). Opens UPWARD — it sits at the bottom of an overflow-hidden card,
 *  so a downward menu would be clipped. */
function ReuseSplitButton({
  model,
  tokens,
  disabled,
  onPick,
}: {
  model: VideoModel;
  tokens: number;
  disabled: boolean;
  onPick: (mode: "autopilot" | "manual") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = VIDEO_MODEL_INFO[model].label;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(mode: "autopilot" | "manual") {
    setOpen(false);
    onPick(mode);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-[12.5px] font-medium transition-all disabled:opacity-50",
          open
            ? "border-pulse/70 bg-pulse/[0.14] text-white shadow-[0_6px_28px_-8px_rgba(255,45,45,0.6)]"
            : "border-white/12 bg-white/[0.04] text-white/85 hover:border-pulse/50 hover:bg-white/[0.06] hover:text-white",
        )}
      >
        <Clapperboard className="h-4 w-4 text-pulse" />
        Make {label}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-white/50 transition-transform duration-200",
            open && "rotate-180 text-pulse",
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-[calc(100%+8px)] left-0 z-40 w-[268px] origin-bottom overflow-hidden rounded-[14px] border border-white/12 bg-[#161616]/95 p-1.5 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl"
          >
            <ReuseOption
              icon={<Sparkles className="h-4 w-4" />}
              title={`Make ${label} in Automatic Mode`}
              desc="Render the whole video in one go"
              badge={`${tokens} tokens`}
              onClick={() => pick("autopilot")}
            />
            <div className="my-1 h-px bg-white/[0.06]" />
            <ReuseOption
              icon={<Pencil className="h-4 w-4" />}
              title={`Make ${label} in Manual Mode`}
              desc="Open the frames in the editor first"
              badge="pay when you render"
              onClick={() => pick("manual")}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One option row inside a ReuseSplitButton menu. */
function ReuseOption({
  icon,
  title,
  desc,
  badge,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  badge: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-pulse/[0.14]"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pulse/15 text-pulse transition-transform group-hover:scale-110">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-medium leading-snug text-white">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-white/45">{desc}</span>
        <span className="mt-1.5 inline-block rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/55">
          {badge}
        </span>
      </span>
    </button>
  );
}

/** Turn a raw pipeline/provider error into something a user can read. */
function humanizeVideoError(raw: string | null | undefined): string {
  if (!raw) return "Something went wrong while generating this video.";
  if (isModerationError(raw)) {
    return "The Cinematic video model rejected a frame as possibly showing a real person. Retry with a more permissive model that still keeps the cinematic transitions — or switch to Living Scenes / a more stylized art direction (which usually passes).";
  }
  if (/not enough tokens|credits/i.test(raw)) return raw;
  // Strip our wrapper + nested HTTP/JSON noise; keep it short and legible.
  const cleaned = raw
    .replace(/^video (submit|generation|download)[^:]*:\s*/i, "")
    .replace(/\{[\s\S]*$/, "")
    .trim();
  return cleaned.length > 0 ? cleaned : "Generation failed — please try again.";
}

/** Edit-mode lyric-video panel: a tab per generated style (plus the one being
 *  generated), the player for the active tab — or a live progress view while
 *  that style is still rendering — and a "Choose as public" action. */
export function VideoTabs({
  song,
  activeJob,
  onUpdate,
  onJobComplete,
  onJobFailed,
}: {
  song: Song;
  /** A job currently generating (shown as a tab with in-player progress). */
  activeJob: VideoJob | null;
  onUpdate: (s: Song) => void;
  onJobComplete: () => void;
  onJobFailed: (message: string) => void;
}) {
  const toast = useToast();
  const { account } = useAccount();
  const allowClean = !!account && canRemoveWatermark(account.plan);
  const [theaterOpen, setTheaterOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [dlResolution, setDlResolution] = useState<VideoDownloadResolution>("1080p");
  const [dlWatermark, setDlWatermark] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [liveJob, setLiveJob] = useState<VideoJob | null>(activeJob);
  const [selected, setSelected] = useState<VideoModel>(
    () => activeJob?.model ?? VIDEO_MODELS.find((m) => song.videos.some((v) => v.model === m)) ?? "fast",
  );
  const [busy, setBusy] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [editing, setEditing] = useState(false);

  // When a new job starts, focus its tab and start tracking it.
  useEffect(() => {
    if (activeJob) {
      setLiveJob(activeJob);
      setSelected(activeJob.model);
    }
  }, [activeJob?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll the in-flight job; hand off to the parent when it finishes. Skip while
  // awaiting manual review — the carousel drives changes via direct API calls.
  useEffect(() => {
    if (
      !liveJob ||
      liveJob.status === "ready" ||
      liveJob.status === "failed" ||
      liveJob.status === "review"
    )
      return;
    const t = setTimeout(async () => {
      try {
        const next = await getVideoJob(liveJob.id);
        setLiveJob(next);
        if (next.status === "ready" || next.status === "failed") setPromoting(false);
        if (next.status === "ready") onJobComplete();
        else if (next.status === "failed") onJobFailed(next.error ?? "Video generation failed.");
      } catch {
        // transient — the next tick retries
      }
    }, 3500);
    return () => clearTimeout(t);
  }, [liveJob, onJobComplete, onJobFailed]);

  // Which styles get a tab: any with a finished video, plus the one generating
  // (the seeded activeJob, or a reuse-from-frames job started here via liveJob).
  const tabModels = VIDEO_MODELS.filter(
    (m) => song.videos.some((v) => v.model === m) || activeJob?.model === m || liveJob?.model === m,
  );
  if (tabModels.length === 0) return null;

  const liveBusy = liveJob?.status === "pending" || liveJob?.status === "processing";
  // The style with an in-flight job (drives the progress view + tab spinner) —
  // keyed off the live job so it works for seeded jobs AND ones started here
  // (e.g. promoting a preview to full, where no activeJob was passed in).
  const busyModel = liveBusy ? liveJob?.model : undefined;
  const completed = song.videos.find((v) => v.model === selected);
  // While THIS style is generating, always show progress — even if an older
  // video for it already exists (otherwise it looks like nothing is happening).
  const showProgress = liveBusy && selected === liveJob?.model;
  // Manual mode is awaiting per-line review for this style.
  const showReview =
    !!liveJob && liveJob.status === "review" && selected === liveJob.model;
  // This style's generation failed — show the error + retry in the player slot.
  const showFailed =
    !!liveJob && liveJob.status === "failed" && selected === liveJob.model && !showProgress;

  function applySegment(seg: ReviewSegment) {
    setLiveJob((j) =>
      j ? { ...j, segments: j.segments.map((s) => (s.index === seg.index ? seg : s)) } : j,
    );
  }

  async function generateFull(permissive = false) {
    setPromoting(true);
    try {
      // Promote the preview → full render (also the failure retry); `permissive`
      // retries Cinematic on the more permissive motion model. Resume polling.
      const job = await generateFullVideo(song.id, selected, permissive);
      setLiveJob(job);
    } catch (e) {
      setPromoting(false);
      toast(e instanceof ApiError ? e.message : "Couldn't start the full video.", "error");
    }
  }

  // Prefer the freshly-finished video (before the song refetch lands).
  const liveUrl =
    selected === liveJob?.model && liveJob?.status === "ready" ? liveJob.videoUrl : null;
  const url = liveUrl ?? completed?.url;
  // Is the shown video only a preview? (the live one, or the saved one)
  const previewShown = !!url && (liveUrl ? !!liveJob?.isPreview : !!completed?.isPreview);
  const isPublic = !!completed && song.publicVideoModel === selected;

  // The selected tab shows a finished FULL video → its frames can seed other styles.
  const sourceIsFull = !!completed && !previewShown;
  const reuseTargets = sourceIsFull
    ? VIDEO_MODELS.filter(
        (m) =>
          m !== selected &&
          VIDEO_MODEL_INFO[m].enabled &&
          !song.videos.some((v) => v.model === m && !v.isPreview),
      )
    : [];
  // Clip-only price (images are reused). quality/size don't affect the clip term.
  const reuseTokens = (m: VideoModel) =>
    estimateVideoCost({
      model: m,
      quality: "fast",
      imageSize: "1K",
      lyrics: song.lyrics,
      durationSeconds: song.durationSeconds,
      reuseImages: true,
    }).tokens;

  async function createFromFrames(target: VideoModel, mode: "autopilot" | "manual" = "autopilot") {
    setPromoting(true);
    try {
      const job = await createVideoFromFrames(song.id, target, selected, mode);
      setSelected(target); // focus the new style's tab so its progress shows
      setLiveJob(job);
    } catch (e) {
      setPromoting(false);
      toast(e instanceof ApiError ? e.message : "Couldn't start the video.", "error");
    }
  }

  // Re-open the finished video for this style into the manual-review carousel
  // (a fresh edit job seeded with its frames). The existing showReview path then
  // renders ManualReview.
  async function startEdit() {
    setEditing(true);
    try {
      const job = await editVideo(song.id, selected);
      setLiveJob(job);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't open the editor.", "error");
    } finally {
      setEditing(false);
    }
  }

  // Throw away the in-progress edit (delete the edit job) and drop back to the
  // still-live finished video. onJobComplete clears any seeded active job + refetches.
  // Abandon a review job (edit OR first-time manual): the server deletes the job +
  // its own frames/clips and refunds the up-front charge. For an edit the source
  // video survives; for a first-time manual job the whole in-progress video goes.
  async function discardReview() {
    if (!liveJob) return;
    setEditing(true);
    try {
      await discardVideoEdit(liveJob.id);
      setLiveJob(null);
      onJobComplete();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't delete this video.", "error");
    } finally {
      setEditing(false);
    }
  }

  async function deleteVideo() {
    if (!completed) return;
    setBusy(true);
    try {
      const updated = await deleteSongVideo(song.id, selected);
      setDeleteOpen(false);
      // Drop a lingering live/failed job for this style, and move the selection
      // to another remaining style if there is one.
      if (liveJob?.model === selected) setLiveJob(null);
      const remaining = VIDEO_MODELS.filter((m) => updated.videos.some((v) => v.model === m));
      if (remaining.length > 0) setSelected(remaining[0]!);
      onUpdate(updated);
      toast(`${VIDEO_MODEL_INFO[selected].label} video deleted.`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't delete the video.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublic() {
    if (!completed) return;
    setBusy(true);
    try {
      // Public toggles both ways: pick this style, or pass null to unpublish.
      const next = isPublic ? null : selected;
      const updated = await setPublicVideo(song.id, next);
      onUpdate(updated);
      toast(
        next
          ? `${VIDEO_MODEL_INFO[selected].label} is now on your public page.`
          : "Removed from your public page.",
      );
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't update the public video.", "error");
    } finally {
      setBusy(false);
    }
  }

  // Request a download variant (resolution ± watermark). The server produces and
  // caches it on demand from the clean master, so we poll until it's ready, then
  // fetch → blob → trigger the browser download with a friendly filename.
  async function startDownload() {
    const watermark = !(allowClean && !dlWatermark);
    setDownloading(true);
    try {
      let url: string | null = null;
      // Poll the idempotent endpoint until the variant is ready in R2.
      for (let i = 0; i < 80; i++) {
        const res = await requestVideoDownload(song.id, selected, {
          resolution: dlResolution,
          watermark,
        });
        if (res.status === "ready" && res.url) {
          url = res.url;
          break;
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
      if (!url) throw new Error("Download timed out — please try again.");
      const blob = await (await fetch(url)).blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${song.title || "lyrics"}-${selected}-${dlResolution}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      setDownloadOpen(false);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Download failed.", "error");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mt-6 overflow-hidden rounded-[14px] border border-white/[0.08] bg-gradient-to-br from-pulse/[0.05] to-transparent p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-[13px] font-medium text-white">Lyric videos</h3>
        {liveBusy && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-pulse/15 px-2 py-0.5 text-[11px] font-medium text-pulse">
            <Loader2 className="h-3 w-3 animate-spin" />
            Generating…
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {tabModels.map((m) => {
          const sel = m === selected;
          const pub = song.publicVideoModel === m && song.videos.some((v) => v.model === m);
          const gen = m === busyModel;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setSelected(m)}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors",
                sel
                  ? "border-pulse/60 bg-pulse/[0.14] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                  : "border-white/10 bg-white/[0.03] text-white/65 hover:border-white/20 hover:text-white",
              )}
            >
              {VIDEO_MODEL_INFO[m].label}
              {gen ? (
                <Loader2 className="h-3 w-3 animate-spin text-pulse" />
              ) : pub ? (
                <Globe className="h-3 w-3 text-pulse" />
              ) : null}
            </button>
          );
        })}
      </div>

      {showReview && liveJob ? (
        <ManualReview
          job={liveJob}
          audioUrl={song.audioUrl}
          onSegmentUpdated={applySegment}
          onJobUpdated={(updated) => setLiveJob(updated)}
          onFinalized={(updated) => setLiveJob(updated)}
          onCancel={() => void discardReview()}
          finalizeCost={liveJob.isEdit ? reRenderTokens(liveJob.model, liveJob.segments) : undefined}
        />
      ) : showProgress ? (
        <ProgressPanel
          done={liveJob?.completedSegments ?? 0}
          total={liveJob?.totalSegments ?? 0}
        />
      ) : showFailed ? (
        <FailedPanel
          message={humanizeVideoError(liveJob?.error)}
          busy={promoting}
          retryLabel={
            selected === "pro" && isModerationError(liveJob?.error)
              ? "Retry with a more permissive model"
              : "Retry"
          }
          onRetry={() =>
            void generateFull(selected === "pro" && isModerationError(liveJob?.error))
          }
        />
      ) : url ? (
        <>
          <div className="relative mt-3">
            <video
              key={url}
              src={url}
              controls
              controlsList="nodownload"
              onContextMenu={(e) => e.preventDefault()}
              crossOrigin="anonymous"
              className="block aspect-video w-full overflow-hidden rounded-[10px] border border-white/10 bg-black"
            />
            {previewShown && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden rounded-[10px]">
                <span className="select-none bg-gradient-to-br from-white/95 to-white/40 bg-clip-text text-[clamp(2.2rem,8vw,4.5rem)] font-semibold tracking-[8px] text-transparent opacity-80 drop-shadow-[0_4px_28px_rgba(0,0,0,0.65)]">
                  PREVIEW
                </span>
              </div>
            )}
          </div>
          {previewShown ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] text-white/45">A ~10s sample — love it?</span>
              <Button3D disabled={promoting} onClick={() => void generateFull()} className="whitespace-nowrap">
                {promoting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Clapperboard className="h-4 w-4" />
                )}
                Generate full music video
              </Button3D>
            </div>
          ) : (
            <>
            <div className="mt-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  onClick={() => {
                    setDlResolution("1080p");
                    setDlWatermark(true);
                    setDownloadOpen(true);
                  }}
                  className="inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-pulse/50 hover:text-white sm:w-auto sm:justify-start"
                >
                  <Download className="h-3.5 w-3.5 text-pulse" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => void startEdit()}
                  disabled={editing || liveBusy}
                  className="inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-pulse/50 hover:text-white disabled:opacity-60 sm:w-auto sm:justify-start"
                >
                  {editing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-pulse" />
                  ) : (
                    <Pencil className="h-3.5 w-3.5 text-pulse" />
                  )}
                  Edit scenes
                </button>
                <button
                  type="button"
                  onClick={() => setTheaterOpen(true)}
                  className="inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-pulse/50 hover:text-white sm:w-auto sm:justify-start"
                >
                  <Maximize2 className="h-3.5 w-3.5 text-pulse" />
                  Theater
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  disabled={busy}
                  className="inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/60 transition-colors hover:border-pulse/50 hover:text-pulse disabled:opacity-60 sm:w-auto sm:justify-start"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
              {completed &&
                (isPublic ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-success/[0.12] px-3.5 py-1.5 text-[12px] font-medium text-success">
                      <Check className="h-3.5 w-3.5" />
                      On your public page
                    </span>
                    <Button3D variant="secondary" onClick={() => void togglePublic()} disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Make private
                    </Button3D>
                  </div>
                ) : (
                  <Button3D onClick={() => void togglePublic()} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                    Make public
                  </Button3D>
                ))}
            </div>
            {reuseTargets.length > 0 && (
              <div className="mt-3 border-t border-white/[0.06] pt-3">
                <p className="mb-2 text-[11px] uppercase tracking-[0.5px] text-white/40">
                  Reuse these frames
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  {reuseTargets.map((m) => (
                    <ReuseSplitButton
                      key={m}
                      model={m}
                      tokens={reuseTokens(m)}
                      disabled={promoting || liveBusy}
                      onPick={(mode) => void createFromFrames(m, mode)}
                    />
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-white/35">
                  Reuses these images — only the motion is generated, so it costs far less.{" "}
                  <span className="text-white/45">“Manual” opens the frames in the editor first.</span>
                </p>
              </div>
            )}
            </>
          )}
        </>
      ) : (
        <div className="mt-3 aspect-video w-full overflow-hidden rounded-[10px] border border-white/10 bg-black" />
      )}

      {url && (
        <TheaterMode
          open={theaterOpen}
          src={url}
          title={`${song.title} · ${VIDEO_MODEL_INFO[selected].label}`}
          onClose={() => setTheaterOpen(false)}
        />
      )}

      <Modal
        open={downloadOpen}
        onClose={() => !downloading && setDownloadOpen(false)}
        title="Download video"
      >
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.5px] text-white/40">
              Resolution
            </p>
            <div className="grid grid-cols-3 gap-2">
              {VIDEO_DOWNLOAD_RESOLUTIONS.map((res) => (
                <button
                  key={res}
                  type="button"
                  disabled={downloading}
                  onClick={() => setDlResolution(res)}
                  className={cn(
                    "rounded-[10px] border px-3 py-2.5 text-[13px] font-medium transition-colors disabled:opacity-60",
                    dlResolution === res
                      ? "border-pulse bg-pulse/[0.12] text-white"
                      : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25 hover:text-white",
                  )}
                >
                  {res}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.5px] text-white/40">
              Watermark
            </p>
            {allowClean ? (
              <button
                type="button"
                disabled={downloading}
                onClick={() => setDlWatermark((v) => !v)}
                className="flex w-full items-center justify-between rounded-[10px] border border-white/10 bg-white/[0.03] px-3.5 py-3 text-left transition-colors hover:border-white/25 disabled:opacity-60"
              >
                <span className="text-[13px] text-white/80">Remove Syllary watermark</span>
                <span
                  className={cn(
                    "relative h-[22px] w-[38px] rounded-full transition-colors",
                    !dlWatermark ? "bg-pulse" : "bg-white/15",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all",
                      !dlWatermark ? "left-[19px]" : "left-[3px]",
                    )}
                  />
                </span>
              </button>
            ) : (
              <div className="flex items-start gap-2.5 rounded-[10px] border border-white/10 bg-white/[0.03] px-3.5 py-3">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
                <div className="text-[12.5px] leading-relaxed text-white/55">
                  The Syllary watermark is included on every download.{" "}
                  <span className="inline-flex items-center gap-1 font-medium text-pulse">
                    <Sparkles className="h-3.5 w-3.5" />
                    Music-video plans
                  </span>{" "}
                  can download without it.
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={downloading}
              onClick={() => setDownloadOpen(false)}
              className="rounded-[10px] px-4 py-2 text-[13px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
            >
              Cancel
            </button>
            <Button3D onClick={() => void startDownload()} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {downloading ? "Preparing…" : "Download"}
            </Button3D>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => !busy && setDeleteOpen(false)}
        title={`Delete ${VIDEO_MODEL_INFO[selected].label} video`}
      >
        <p className="text-[13px] leading-relaxed text-white/60">
          Delete the <span className="font-medium text-white">{VIDEO_MODEL_INFO[selected].label}</span>{" "}
          video for <span className="font-medium text-white">{song.title}</span>? This removes that
          rendered video (the other styles are untouched). You can regenerate it afterwards. This
          can&apos;t be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setDeleteOpen(false)}
            className="rounded-[10px] px-4 py-2 text-[13px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void deleteVideo()}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-pulse px-4 py-2 text-[13px] font-medium text-white transition-transform hover:scale-[1.03] disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}

/** Shown in the player slot when a style's generation failed: a readable error
 *  and a retry button (re-runs the style with the same settings). */
function FailedPanel({
  message,
  busy,
  retryLabel,
  onRetry,
}: {
  message: string;
  busy: boolean;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="mt-3 flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-[10px] border border-pulse/30 bg-black px-6 text-center">
      <AlertCircle className="h-8 w-8 text-pulse" />
      <p className="text-[14px] font-medium text-white">Couldn&apos;t generate this video</p>
      <p className="max-w-[460px] text-[12.5px] leading-relaxed text-white/55">{message}</p>
      <Button3D onClick={onRetry} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {busy ? "Retrying…" : retryLabel}
      </Button3D>
    </div>
  );
}

/** Live progress shown inside the player slot while a style is rendering. */
function ProgressPanel({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mt-3 flex aspect-video w-full flex-col items-center justify-center rounded-[10px] border border-white/10 bg-black text-center">
      <div className="relative mb-4 h-16 w-16">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2.4, ease: "linear" }}
          className="absolute inset-0 rounded-full"
          style={{
            background: "conic-gradient(from 0deg, #ff2d2d, transparent 65%)",
            maskImage: "radial-gradient(closest-side, transparent 62%, #000 64%)",
            WebkitMaskImage: "radial-gradient(closest-side, transparent 62%, #000 64%)",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Clapperboard className="h-6 w-6 text-pulse" />
        </div>
      </div>
      <p className="text-[14px] font-medium text-white">Creating your video…</p>
      <p className="mt-1 text-[12px] text-white/50">
        {done > 0 && total > 0
          ? `Scene ${done} of ${total} done`
          : "Painting the first scenes — this part takes a moment"}
      </p>
      <div className="mx-auto mt-4 h-2 w-[70%] max-w-[320px] overflow-hidden rounded-full bg-white/[0.08]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#ff5151] to-pulse shadow-[0_0_12px_rgba(255,45,45,0.6)]"
          animate={{ width: `${Math.max(pct, 5)}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
      <p className="mt-3 max-w-[80%] text-[11px] text-white/35">
        Feel free to explore the app — we'll have it ready shortly.
      </p>
    </div>
  );
}
