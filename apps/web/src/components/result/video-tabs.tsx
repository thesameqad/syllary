import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Clapperboard, Download, Globe, Loader2, Maximize2 } from "lucide-react";
import {
  type ReviewSegment,
  VIDEO_MODELS,
  VIDEO_MODEL_INFO,
  type Song,
  type VideoJob,
  type VideoModel,
} from "@syllary/shared";
import { ApiError, generateFullVideo, getVideoJob, setPublicVideo } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Button3D } from "@/components/ui/button-3d";
import { ManualReview } from "@/components/result/manual-review";
import { TheaterMode } from "@/components/result/theater-mode";
import { cn } from "@/lib/utils";

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
  const [theaterOpen, setTheaterOpen] = useState(false);
  const [liveJob, setLiveJob] = useState<VideoJob | null>(activeJob);
  const [selected, setSelected] = useState<VideoModel>(
    () => activeJob?.model ?? VIDEO_MODELS.find((m) => song.videos.some((v) => v.model === m)) ?? "fast",
  );
  const [busy, setBusy] = useState(false);
  const [promoting, setPromoting] = useState(false);

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
        if (next.status === "ready") onJobComplete();
        else if (next.status === "failed") onJobFailed(next.error ?? "Video generation failed.");
      } catch {
        // transient — the next tick retries
      }
    }, 3500);
    return () => clearTimeout(t);
  }, [liveJob, onJobComplete, onJobFailed]);

  // Which styles get a tab: any with a finished video, plus the one generating.
  const tabModels = VIDEO_MODELS.filter(
    (m) => song.videos.some((v) => v.model === m) || activeJob?.model === m,
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

  function applySegment(seg: ReviewSegment) {
    setLiveJob((j) =>
      j ? { ...j, segments: j.segments.map((s) => (s.index === seg.index ? seg : s)) } : j,
    );
  }

  async function generateFull() {
    setPromoting(true);
    try {
      // Promote the preview → full render with the same settings; resume polling.
      const job = await generateFullVideo(song.id, selected);
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

  async function choosePublic() {
    if (!completed) return;
    setBusy(true);
    try {
      const updated = await setPublicVideo(song.id, selected);
      onUpdate(updated);
      toast(`${VIDEO_MODEL_INFO[selected].label} is now on your public page.`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't update the public video.", "error");
    } finally {
      setBusy(false);
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
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors",
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
          onSegmentUpdated={applySegment}
          onFinalized={(updated) => setLiveJob(updated)}
        />
      ) : showProgress ? (
        <ProgressPanel
          done={liveJob?.completedSegments ?? 0}
          total={liveJob?.totalSegments ?? 0}
        />
      ) : url ? (
        <>
          <div className="relative mt-3">
            <video
              key={url}
              src={url}
              controls
              crossOrigin="anonymous"
              className="aspect-video w-full overflow-hidden rounded-[10px] border border-white/10 bg-black"
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
              <Button3D disabled={promoting} onClick={() => void generateFull()}>
                {promoting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Clapperboard className="h-4 w-4" />
                )}
                Generate full music video
              </Button3D>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <a
                  href={url}
                  download={`${song.title || "lyrics"}-${selected}.mp4`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-pulse/50 hover:text-white"
                >
                  <Download className="h-3.5 w-3.5 text-pulse" />
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setTheaterOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-pulse/50 hover:text-white"
                >
                  <Maximize2 className="h-3.5 w-3.5 text-pulse" />
                  Theater
                </button>
              </div>
              {completed &&
                (isPublic ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/[0.12] px-3.5 py-1.5 text-[12px] font-medium text-success">
                    <Check className="h-3.5 w-3.5" />
                    On your public page
                  </span>
                ) : (
                  <Button3D onClick={() => void choosePublic()} disabled={busy}>
                    <Globe className="h-4 w-4" />
                    Choose as public
                  </Button3D>
                ))}
            </div>
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
