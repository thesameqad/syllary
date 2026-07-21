import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Ban,
  Clapperboard,
  Film,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  Repeat,
  Scissors,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  findMentionedNames,
  GROK_MAX_SECONDS,
  IMAGE_QUALITY_INFO,
  LITE_CLIP_MAX_SECONDS,
  type ReviewSegment,
  reRenderTokens,
  type Song,
  singleClipTokens,
  singleImageTokens,
  singlePlateTokens,
  VIDEO_MODEL_INFO,
  type VideoJob,
} from "@syllary/shared";
import {
  ApiError,
  createSceneGroup,
  deleteSceneGroup,
  discardVideoEdit,
  finalizeVideoJob,
  getSong,
  getVideoJob,
  listElements,
  moveSegmentLine,
  applySegmentPlates,
  regenerateClip,
  regenerateSegment,
  updateSceneGroup,
  updateSegment,
} from "@/lib/api";
import { captureClient } from "@/lib/analytics";
import { useAccount } from "@/lib/account-context";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { Button3D } from "@/components/ui/button-3d";
import { MentionTextarea, type MentionTextareaHandle } from "@/components/ui/mention-textarea";
import { LogoWordmark } from "@/components/logo";
import { PlansModal } from "@/components/result/plans-modal";
import {
  ClipPreview,
  FIELD,
  fmtTime,
  ImagePainting,
  motionSeed,
} from "@/components/result/clip-preview";
import { DashboardChrome } from "@/components/dashboard/dashboard-layout";
import { authConfigured } from "@/lib/auth";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// The full-page Video Editor — "the cutting room" as a PIPELINE GRAPH:
//   LYRIC LINES  ──connector──▶  IMAGE node  ──connector──▶  CLIP node
// Lines are always individual rows with timings. Connectors show how many lines
// feed one scene; the connection TYPE is visible and editable ("At once" = one
// baked stanza image, "In sequence" = plates over one looping clip). Breaking /
// making connections IS the grouping UI. Connector color carries state (red
// pulse = generating, amber = the clip is stale because the image changed).
// ---------------------------------------------------------------------------

const MAX_PARALLEL = 4;

type TaskKind = "image" | "clip";
type TaskPhase = "queued" | "running" | "error";
type TaskState = { kind: TaskKind; phase: TaskPhase; error?: string };

function taskKey(kind: TaskKind, index: number): string {
  return `${kind}:${index}`;
}

function EditorFrame({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  return signedIn ? (
    <DashboardChrome>
      <div className="mx-auto max-w-[1500px]">{children}</div>
    </DashboardChrome>
  ) : (
    <main className="min-h-dvh bg-void text-white">
      <header className="border-b border-white/[0.04]">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-4">
          <Link to="/" aria-label="Syllary home">
            <LogoWordmark />
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-[1500px] px-6 py-10">{children}</div>
    </main>
  );
}

export function VideoEditorPage() {
  return authConfigured ? <VideoEditorAuthAware /> : <EditorSignedOut signedIn={false} />;
}

function VideoEditorAuthAware() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  if (!isSignedIn) return <EditorSignedOut signedIn={false} />;
  return <VideoEditorInner />;
}

function EditorSignedOut({ signedIn }: { signedIn: boolean }) {
  const { songId } = useParams<{ songId: string }>();
  return (
    <EditorFrame signedIn={signedIn}>
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <Clapperboard className="h-8 w-8 text-white/30" />
        <h1 className="text-[18px] font-medium text-white">Sign in to edit videos</h1>
        <p className="max-w-[360px] text-[13px] text-white/50">
          The Video Editor lets you direct and regenerate every scene of your lyric video.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Link to="/sign-in">
            <Button3D>Sign in</Button3D>
          </Link>
          {songId && (
            <Link to={`/s/${songId}`}>
              <Button3D variant="secondary">Back to the song</Button3D>
            </Link>
          )}
        </div>
      </div>
    </EditorFrame>
  );
}

// Presigned URLs carry a fresh signature on EVERY poll even when the R2 object
// is unchanged, so naively swapping in polled segments changes each <img>/<video>
// src and makes finished scenes blink while others still generate. Two URLs
// point at the same object iff their paths (sans query) match — reuse the
// previous segment object when a poll brought nothing new. Regenerations
// bypass this (applySegment sets the response directly), so an overwritten
// image under the same key still gets its fresh URL and refetches.
function sameAsset(a: string | null, b: string | null): boolean {
  return (a ? a.split("?")[0] : null) === (b ? b.split("?")[0] : null);
}
function stableSegment(prev: ReviewSegment | undefined, fresh: ReviewSegment): ReviewSegment {
  if (!prev) return fresh;
  const unchanged =
    prev.status === fresh.status &&
    prev.clipStatus === fresh.clipStatus &&
    prev.text === fresh.text &&
    prev.prompt === fresh.prompt &&
    prev.direction === fresh.direction &&
    prev.motionDirection === fresh.motionDirection &&
    prev.textMode === fresh.textMode &&
    prev.platesReady === fresh.platesReady &&
    prev.platesApplied === fresh.platesApplied &&
    prev.loopSeconds === fresh.loopSeconds &&
    prev.noCast === fresh.noCast &&
    prev.clipStart === fresh.clipStart &&
    prev.clipEnd === fresh.clipEnd &&
    sameAsset(prev.imageUrl, fresh.imageUrl) &&
    sameAsset(prev.clipUrl, fresh.clipUrl);
  return unchanged ? prev : fresh;
}

function VideoEditorInner() {
  const { songId } = useParams<{ songId: string }>();
  const [searchParams] = useSearchParams();
  const jobIdParam = searchParams.get("job");
  const navigate = useNavigate();
  const toast = useToast();
  const { account, refresh } = useAccount();
  const reducedMotion = usePrefersReducedMotion();

  const [job, setJob] = useState<VideoJob | null>(null);
  // First-open explainer for comp-claim ("gift") jobs: the user arrived from an
  // email onto the busiest page in the product while it generates scenes on its
  // own — one modal turns confusion into delight. Shown once per job.
  useEffect(() => {
    if (!job?.isComp) return;
    const key = `comp_gift_seen:${job.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    setGiftOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.isComp, job?.id]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [song, setSong] = useState<Song | null>(null);
  const [songTitle, setSongTitle] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  // --- Parallel regeneration queue -----------------------------------------
  const [tasks, setTasks] = useState<Map<string, TaskState>>(new Map());
  const queueRef = useRef<{ key: string; run: () => Promise<ReviewSegment> }[]>([]);
  const runningRef = useRef(0);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const setTask = useCallback((key: string, state: TaskState | null) => {
    setTasks((prev) => {
      const next = new Map(prev);
      if (state) next.set(key, state);
      else next.delete(key);
      return next;
    });
  }, []);

  const applySegment = useCallback((seg: ReviewSegment) => {
    setJob((j) =>
      j ? { ...j, segments: j.segments.map((s) => (s.index === seg.index ? seg : s)) } : j,
    );
  }, []);

  const pump = useCallback(() => {
    while (runningRef.current < MAX_PARALLEL && queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      runningRef.current += 1;
      const kind = next.key.startsWith("image") ? ("image" as const) : ("clip" as const);
      setTask(next.key, { kind, phase: "running" });
      void next
        .run()
        .then((seg) => {
          applySegment(seg);
          setTask(next.key, null);
          refresh(); // the balance just ticked down
        })
        .catch((e) => {
          const raw = e instanceof ApiError ? e.message : "Couldn't regenerate this scene.";
          const insufficient = e instanceof ApiError && e.status === 402;
          // Scene work is charged ONLY on success (server rule) — say so on
          // every failure, or the user is left wondering whether they just
          // paid for nothing and whether retrying charges again. Skip when
          // the server message already covers billing (or it's a 402).
          const msg =
            insufficient || /charg/i.test(raw)
              ? raw
              : `${raw} You were not charged — tokens are only deducted when a scene succeeds.`;
          if (insufficient) setPlansOpen(true);
          else toast(msg, "error");
          setTask(next.key, { kind, phase: "error", error: msg });
        })
        .finally(() => {
          runningRef.current -= 1;
          pump();
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enqueue = useCallback(
    (kind: TaskKind, index: number, run: () => Promise<ReviewSegment>) => {
      const key = taskKey(kind, index);
      const existing = tasksRef.current.get(key);
      if (existing && existing.phase !== "error") return;
      setTask(key, { kind, phase: "queued" });
      queueRef.current.push({ key, run });
      pump();
    },
    [pump, setTask],
  );

  const busyIndexes = useMemo(() => {
    const set = new Set<number>();
    for (const [key, state] of tasks) {
      if (state.phase !== "error") set.add(Number(key.split(":")[1]));
    }
    return set;
  }, [tasks]);

  // --- Load song + job -------------------------------------------------------
  useEffect(() => {
    if (!songId) return;
    let cancelled = false;
    (async () => {
      try {
        const song = await getSong(songId);
        if (cancelled) return;
        setAudioUrl(song.audioUrl);
        setSong(song);
        setSongTitle(song.title || song.originalFilename || "Untitled");
        if (jobIdParam) {
          const j = await getVideoJob(jobIdParam, { scenes: true });
          if (cancelled) return;
          if (j.songId !== songId) return setNotFound(true);
          setJob(j);
        } else if (
          song.activeVideoJob &&
          song.activeVideoJob.mode === "manual" &&
          ["pending", "processing", "review"].includes(song.activeVideoJob.status)
        ) {
          setJob(song.activeVideoJob);
        } else {
          setNotFound(true);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof ApiError ? e.message : "Could not load this video.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [songId, jobIdParam]);

  useEffect(() => {
    if (job?.id) captureClient("video_editor_opened", { job_id: job.id, status: job.status });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  // --- Poll while the pipeline is working ------------------------------------
  useEffect(() => {
    if (!job || (job.status !== "pending" && job.status !== "processing")) return;
    const t = setInterval(() => {
      void getVideoJob(job.id, { scenes: true })
        .then((fresh) => {
          setJob((prev) => {
            if (!prev) return fresh;
            const merged = fresh.segments.length
              ? {
                  ...fresh,
                  segments: fresh.segments.map((s) => {
                    const p = prev.segments.find((q) => q.index === s.index);
                    if (busyIndexes.has(s.index)) return p ?? s;
                    return stableSegment(p, s);
                  }),
                }
              : fresh;
            return merged;
          });
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(t);
  }, [job, busyIndexes]);

  useEffect(() => {
    if (!job || !songId) return;
    if (job.status === "ready") {
      toast("Your video is ready!", "success");
      navigate(`/s/${songId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  if (!songId) return <Navigate to="/" replace />;
  if (notFound) return <Navigate to={`/s/${songId}`} replace />;

  if (loadError) {
    return (
      <EditorFrame signedIn>
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
          <AlertTriangle className="h-7 w-7 text-pulse" />
          <p className="text-[14px] text-white/70">{loadError}</p>
          <Link to={`/s/${songId}`}>
            <Button3D variant="secondary">Back to the song</Button3D>
          </Link>
        </div>
      </EditorFrame>
    );
  }

  if (!job) {
    return (
      <EditorFrame signedIn>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      </EditorFrame>
    );
  }

  return (
    <EditorFrame signedIn>
      <EditorBody
        job={job}
        setJob={setJob}
        songId={songId}
        songTitle={songTitle}
        audioUrl={audioUrl}
        tasks={tasks}
        enqueue={enqueue}
        applySegment={applySegment}
        credits={account?.credits ?? null}
        finalizing={finalizing}
        setFinalizing={setFinalizing}
        discarding={discarding}
        setDiscarding={setDiscarding}
        confirmDiscard={confirmDiscard}
        setConfirmDiscard={setConfirmDiscard}
        reducedMotion={reducedMotion}
        onPlans={() => setPlansOpen(true)}
      />
      <PlansModal open={plansOpen} onClose={() => setPlansOpen(false)} trigger="video_editor" song={song} />
      <Modal
        open={giftOpen}
        onClose={() => setGiftOpen(false)}
        title="A gift: your full video"
        widthClass="max-w-[440px]"
      >
        <div className="space-y-3 text-[13px] leading-relaxed text-white/70">
          <p>
            This is the studio — and your whole song is being turned into scenes right now,{" "}
            <strong className="text-white">on us</strong>.
          </p>
          <ul className="space-y-2">
            <li>🖼️ Every scene image appearing here is free — already covered.</li>
            <li>
              ✏️ Want a scene different? Tell it what to show and regenerate — that part costs
              tokens (the price is on the button).
            </li>
            <li>
              🎬 Happy with it? Hit <strong className="text-white">Generate video</strong> — your
              first full render is free.
            </li>
          </ul>
          <p className="text-[11px] text-white/40">
            One-time gift. Downloads carry a small watermark — a video plan removes it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setGiftOpen(false)}
          className="mt-5 w-full rounded-full bg-pulse py-2.5 text-[13px] font-medium text-white transition-transform hover:scale-[1.02]"
        >
          Show me my scenes →
        </button>
      </Modal>
    </EditorFrame>
  );
}

// ---------------------------------------------------------------------------
// Body: header + rail + shared fields + the pipeline rows.
// ---------------------------------------------------------------------------
function EditorBody({
  job,
  setJob,
  songId,
  songTitle,
  audioUrl,
  tasks,
  enqueue,
  applySegment,
  credits,
  finalizing,
  setFinalizing,
  discarding,
  setDiscarding,
  confirmDiscard,
  setConfirmDiscard,
  reducedMotion,
  onPlans,
}: {
  job: VideoJob;
  setJob: (j: VideoJob | null) => void;
  songId: string;
  songTitle: string;
  audioUrl: string | null;
  tasks: Map<string, TaskState>;
  enqueue: (kind: TaskKind, index: number, run: () => Promise<ReviewSegment>) => void;
  applySegment: (seg: ReviewSegment) => void;
  credits: number | null;
  finalizing: boolean;
  setFinalizing: (b: boolean) => void;
  discarding: boolean;
  setDiscarding: (b: boolean) => void;
  confirmDiscard: boolean;
  setConfirmDiscard: (b: boolean) => void;
  reducedMotion: boolean;
  onPlans: () => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const segments = job.segments;
  const generating = job.status === "pending" || job.status === "processing";
  const inReview = job.status === "review";
  const supportsMotion = job.model !== "fast";
  // Back-navigation guard while a draft is open (see the header button).
  const [confirmLeave, setConfirmLeave] = useState(false);

  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [elementNames, setElementNames] = useState<string[]>([]);
  useEffect(() => {
    listElements(job.songId)
      .then((els) => setElementNames(els.filter((e) => e.imageUrl).map((e) => e.name)))
      .catch(() => undefined);
  }, [job.songId]);
  const cast = Array.from(new Set([...(job.characterNames ?? []), ...elementNames]));

  const imagesDone = segments.filter((s) => !!s.imageUrl).length;
  const allGenerated = segments.length > 0 && segments.every((s) => !!s.imageUrl);
  const inFlight = Array.from(tasks.values()).filter((t) => t.phase !== "error").length;

  const imageCost = singleImageTokens(job.imageQuality, job.imageSize);
  const blanks = segments.filter((s) => !s.imageUrl).length;
  // "One scene" (sceneGrouping "single") plans its plates AT CREATE, so a
  // prerender job's up-front charge already covered them — mirror the server.
  const platesPrepaid = job.sceneGrouping === "single" && job.prerenderImages && !job.isEdit;
  const platesDue = platesPrepaid
    ? 0
    : segments
        .filter((s) => s.textMode === "plates")
        .reduce((n, s) => n + (s.lines?.filter((l) => l.text.trim()).length ?? 0) - s.platesReady, 0);
  const finalizeCost = job.isComp
    ? 0 // comp claim: the whole first render is a gift — mirror the server
    : (job.isEdit
        ? reRenderTokens(job.model, segments, job.imageQuality)
        : !job.prerenderImages
          ? blanks * imageCost + reRenderTokens(job.model, segments, job.imageQuality)
          : 0) +
      Math.max(0, platesDue) * singlePlateTokens();

  const totalSeconds = segments.length ? Math.max(...segments.map((s) => s.clipEnd)) : 0;

  function scrollToScene(index: number) {
    rowRefs.current.get(index)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function regenerateImage(seg: ReviewSegment, direction?: string, noCast?: boolean) {
    enqueue("image", seg.index, () => regenerateSegment(job.id, seg.index, direction, noCast));
  }

  function regenerateMotion(seg: ReviewSegment, motionDirection?: string, loopSeconds?: number) {
    enqueue("clip", seg.index, () => regenerateClip(job.id, seg.index, motionDirection, loopSeconds));
  }

  // Plates scenes: composite the lyrics onto the already-generated loop (cheap —
  // no motion model call; missing plates are generated, existing reused free).
  function applyPlates(seg: ReviewSegment) {
    enqueue("clip", seg.index, () => applySegmentPlates(job.id, seg.index));
  }

  // A lyric bubble mid-drag: which scene + which line within it.
  const [dragging, setDragging] = useState<{ scene: number; line: number; lines: number } | null>(
    null,
  );

  async function dropLine(toScene: number) {
    if (!dragging) return;
    const { scene, line } = dragging;
    setDragging(null);
    try {
      const updated = await moveSegmentLine(job.id, scene, line, toScene);
      setJob(updated);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't move that line.", "error");
    }
  }

  /** Is `seg` a valid drop target for the bubble being dragged? Timing is
   *  fixed, so only boundary lines can hop to the NEIGHBORING text scene. */
  function dropValidFor(segIndex: number): boolean {
    if (!dragging) return false;
    const target = segments.find((s) => s.index === segIndex);
    if (!target?.text) return false;
    if (dragging.scene === segIndex + 1 && dragging.line === 0) return true; // first line → previous
    if (dragging.scene === segIndex - 1 && dragging.line === dragging.lines - 1) return true; // last line → next
    return false;
  }

  // Mobile replacement for the HTML5 drag (which never fires on touch): boundary
  // lines get explicit ↑/↓ buttons that hop the line to the neighboring text
  // scene — the exact same moves the drag allows.
  const [hopBusy, setHopBusy] = useState(false);
  function hopTargetsFor(segIndex: number): { up: boolean; down: boolean } {
    return {
      up: !!segments.find((s) => s.index === segIndex - 1)?.text,
      down: !!segments.find((s) => s.index === segIndex + 1)?.text,
    };
  }
  async function hopLine(fromScene: number, lineIndex: number, dir: -1 | 1) {
    if (hopBusy) return;
    setHopBusy(true);
    try {
      const updated = await moveSegmentLine(job.id, fromScene, lineIndex, fromScene + dir);
      setJob(updated);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't move that line.", "error");
    } finally {
      setHopBusy(false);
    }
  }

  const [linkBusy, setLinkBusy] = useState<number | null>(null);
  // Link scene at `index` with the next scene (merge into one grouped scene).
  async function linkScenes(index: number) {
    if (linkBusy !== null) return;
    setLinkBusy(index);
    try {
      const a = segments.find((s) => s.index === index);
      // Preserve an existing group's mode when extending it.
      const mode =
        a?.textMode === "plates" || segments.find((s) => s.index === index + 1)?.textMode === "plates"
          ? ("plates" as const)
          : ("baked" as const);
      const updated = await createSceneGroup(job.id, index, index + 1, mode);
      setJob(updated);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't link those scenes.", "error");
    } finally {
      setLinkBusy(null);
    }
  }

  async function ungroup(index: number) {
    try {
      const updated = await deleteSceneGroup(job.id, index);
      setJob(updated);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't split this scene.", "error");
    }
  }

  async function setGroupMode(index: number, mode: "baked" | "plates") {
    try {
      const updated = await updateSceneGroup(job.id, index, mode);
      setJob(updated);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't change the group mode.", "error");
    }
  }

  async function finalize() {
    if (finalizing) return;
    setFinalizing(true);
    try {
      await finalizeVideoJob(job.id);
      // Hand off to the song page IMMEDIATELY — it shows the same render
      // progress the inline manual flow does (via song.activeVideoJob).
      toast("Rendering your video…", "success");
      navigate(`/s/${songId}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) onPlans();
      else toast(e instanceof ApiError ? e.message : "Could not start the render.", "error");
    } finally {
      setFinalizing(false);
    }
  }

  async function discard() {
    if (discarding) return;
    setDiscarding(true);
    try {
      await discardVideoEdit(job.id);
      navigate(`/s/${songId}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not discard this draft.", "error");
      setDiscarding(false);
    }
  }

  return (
    <div className="px-1 pb-28 sm:px-0">
      {/* ------------------------------ Header ------------------------------ */}
      {/* Sticky against the dashboard Shell's <main> (overflow-y-auto, p-6
          md:p-8). Sticky insets resolve against that scrollport's PADDING box,
          so top-0 pinned 24/32px below the visible top with content showing
          through the gap — the negative top/x values cancel the main padding
          exactly (base also swallows EditorBody's px-1), pinning flush. */}
      <div className="sticky -top-6 z-20 -mx-7 border-b border-white/[0.06] bg-void/90 px-7 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:-top-8 md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Back guard: while in review, leaving raises a modal that says the
              draft is saved — without it users have no idea whether their scene
              edits survive the navigation (they always do). */}
          <button
            type="button"
            onClick={() => (inReview ? setConfirmLeave(true) : navigate(`/s/${songId}`))}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-white/50 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="max-w-[180px] truncate sm:max-w-[320px]">{songTitle}</span>
          </button>
          {/* Mobile: the scene count shares the title line (ml-auto pushes it to
              the right edge and wraps the chips to the next line). Desktop keeps
              its copy in the actions cluster. */}
          <span className="ml-auto text-[11.5px] text-white/50 sm:hidden">
            {imagesDone}/{segments.length || job.totalSegments} scenes
          </span>
          <div className="flex items-center gap-2 text-[11px] text-white/40">
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5">
              {VIDEO_MODEL_INFO[job.model].label}
            </span>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5">
              {IMAGE_QUALITY_INFO[job.imageQuality].label}
            </span>
            {job.isEdit && (
              <span className="hidden rounded-full bg-amber-400/10 px-2 py-0.5 text-amber-300/80 sm:inline">
                Editing
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {inFlight > 0 && (
              <span className="flex items-center gap-1.5 text-[11.5px] text-pulse">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {inFlight} scene{inFlight > 1 ? "s" : ""} working
              </span>
            )}
            {credits !== null && (
              <span className="hidden text-[11.5px] text-white/40 sm:block">
                {credits.toLocaleString()} tokens
              </span>
            )}
            <span className="hidden text-[11.5px] text-white/50 sm:inline">
              {imagesDone}/{segments.length || job.totalSegments} scenes
            </span>
            {inReview && (
              <>
                <button
                  type="button"
                  onClick={() => (job.isEdit ? void discard() : setConfirmDiscard(true))}
                  disabled={discarding}
                  className="hidden items-center gap-1 text-[11.5px] text-white/40 transition-colors hover:text-pulse sm:flex"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {job.isEdit ? "Discard edits" : "Delete draft"}
                </button>
                <div className="hidden sm:block">
                  <Button3D
                    onClick={() => void finalize()}
                    disabled={!allGenerated || inFlight > 0 || finalizing}
                  >
                    {finalizing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Clapperboard className="h-4 w-4" />
                    )}
                    {job.isComp
                      ? "Generate video · Free 🎁"
                      : finalizeCost > 0
                        ? `Generate video · ${finalizeCost}`
                        : "Generate video"}
                  </Button3D>
                </div>
              </>
            )}
          </div>
        </div>

        {/* --------------------------- Timeline rail --------------------------- */}
        {/* Hidden on mobile: too fine-grained to tap, and each scene card
            carries its own "Scene n / total" header there instead. */}
        {segments.length > 0 && (
          <div className="mt-3 hidden h-2 w-full items-stretch gap-[2px] sm:flex" aria-hidden>
            {segments.map((s) => {
              const busyState =
                tasks.get(taskKey("image", s.index)) ?? tasks.get(taskKey("clip", s.index));
              const w = totalSeconds > 0 ? ((s.clipEnd - s.clipStart) / totalSeconds) * 100 : 0;
              return (
                <button
                  key={s.index}
                  type="button"
                  onClick={() => scrollToScene(s.index)}
                  style={{ width: `${Math.max(w, 0.6)}%` }}
                  title={`Scene ${s.index + 1} · ${fmtTime(s.clipStart)}`}
                  className={cn(
                    "rounded-[2px] transition-colors",
                    busyState && busyState.phase !== "error"
                      ? "animate-pulse bg-pulse"
                      : busyState?.phase === "error"
                        ? "bg-pulse/50"
                        : !s.imageUrl
                          ? "border border-dashed border-amber-400/40 bg-transparent"
                          : s.clipStatus === "stale"
                            ? "bg-amber-400/60"
                            : "bg-white/25 hover:bg-white/50",
                  )}
                />
              );
            })}
          </div>
        )}

        {/* Column headers — inside the sticky block so "Lyrics / Scene image /
            Motion clip" stay visible while scrolling the pipeline rows. The
            step numbers spell out the pipeline order for first-time users:
            paint the image first, then animate it. */}
        <div className="mt-2.5 hidden grid-cols-[minmax(200px,300px)_36px_minmax(0,1fr)_36px_minmax(0,1fr)] gap-0 px-1 text-[10.5px] uppercase tracking-[0.6px] text-white/30 lg:grid">
          <span>Lyrics</span>
          <span />
          <span>
            {supportsMotion && <span className="mr-1 font-semibold text-white/50">1 ·</span>}
            Scene image
          </span>
          <span />
          <span>
            {supportsMotion && (
              <>
                <span className="mr-1 font-semibold text-white/50">2 ·</span>
                Motion clip
                <span className="ml-1.5 normal-case tracking-normal text-white/25">
                  animates the image
                </span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* ------------------------- Status banners ------------------------- */}
      {generating && (
        <div className="mt-4 flex items-center gap-3 rounded-[12px] border border-white/[0.08] bg-white/[0.02] px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-pulse" />
          <div className="text-[12.5px] text-white/65">
            {job.segments.length > 0 && job.completedSegments < (job.totalSegments || 1)
              ? "Your scenes are being painted — they appear below as they finish."
              : "Rendering your video — stitching every scene together with the song."}
          </div>
        </div>
      )}
      {job.status === "failed" && (
        <div className="mt-4 flex items-center gap-3 rounded-[12px] border border-pulse/30 bg-pulse/[0.06] px-4 py-3 text-[12.5px] text-white/75">
          <AlertTriangle className="h-4 w-4 text-pulse" />
          {job.error ?? "Generation failed — your tokens were refunded."}
        </div>
      )}

      {/* ---------------------------- Pipeline rows --------------------------- */}
      {/* Mobile gets real gaps between scene cards (stacked nodes need the
          separation); desktop keeps the tight rows joined by link gaps. lg
          margin replaces the column-label row that moved into the sticky
          header. */}
      <div className="mt-4 flex flex-col gap-4 lg:mt-5 lg:gap-0">
        {segments.map((seg, i) => (
          <div key={seg.index}>
            <SceneRow
              seg={seg}
              job={job}
              audioUrl={audioUrl}
              cast={cast}
              state={tasks.get(taskKey("image", seg.index)) ?? tasks.get(taskKey("clip", seg.index))}
              interactive={inReview}
              supportsMotion={supportsMotion}
              imageCost={imageCost}
              clipCost={singleClipTokens(job.model, seg.clipEnd - seg.clipStart, job.imageQuality)}
              onRegenerateImage={(direction, noCast) => regenerateImage(seg, direction, noCast)}
              onRegenerateMotion={(motionDirection, loopSeconds) =>
                regenerateMotion(seg, motionDirection, loopSeconds)
              }
              onApplyPlates={() => applyPlates(seg)}
              onUngroup={() => void ungroup(seg.index)}
              onSetMode={(m) => void setGroupMode(seg.index, m)}
              dragging={dragging}
              onDragStart={(line, count) => setDragging({ scene: seg.index, line, lines: count })}
              onDragEnd={() => setDragging(null)}
              dropValid={dropValidFor(seg.index)}
              onDropLine={() => void dropLine(seg.index)}
              hopTargets={hopTargetsFor(seg.index)}
              hopBusy={hopBusy}
              onHopLine={(line, dir) => void hopLine(seg.index, line, dir)}
              onSegmentUpdated={applySegment}
              registerRef={(el) => {
                if (el) rowRefs.current.set(seg.index, el);
                else rowRefs.current.delete(seg.index);
              }}
              reducedMotion={reducedMotion}
            />
            {/* Link gap: merge this scene with the next one. */}
            {inReview && i < segments.length - 1 && (
              <div className="group/gap relative flex h-6 items-center lg:w-[300px]">
                <div className="absolute inset-x-6 top-1/2 h-px bg-white/[0.04]" />
                <button
                  type="button"
                  disabled={linkBusy !== null}
                  onClick={() => void linkScenes(seg.index)}
                  title="Link with the next lines — they'll share one scene."
                  className="relative mx-auto flex h-5 items-center gap-1 rounded-full border border-white/10 bg-void px-2 text-[10px] text-white/35 opacity-0 transition-all hover:border-pulse/50 hover:text-white group-hover/gap:opacity-100 max-lg:opacity-60"
                >
                  {linkBusy === seg.index ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <Link2 className="h-2.5 w-2.5" />
                  )}
                  Link
                </button>
              </div>
            )}
          </div>
        ))}
        {segments.length === 0 && generating && (
          <div className="flex min-h-[30vh] items-center justify-center text-[13px] text-white/45">
            Planning your scenes…
          </div>
        )}
      </div>

      {/* ------------------------ Mobile finalize bar ------------------------ */}
      {inReview && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-void/95 p-3 backdrop-blur sm:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (job.isEdit ? void discard() : setConfirmDiscard(true))}
              disabled={discarding}
              aria-label={job.isEdit ? "Discard edits" : "Delete draft"}
              title={job.isEdit ? "Discard edits" : "Delete draft"}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 text-white/55 transition-colors active:bg-white/10 disabled:opacity-50"
            >
              {discarding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
            <Button3D
              className="flex-1"
              onClick={() => void finalize()}
              disabled={!allGenerated || inFlight > 0 || finalizing}
            >
              {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
              {job.isComp
                ? "Generate video · Free 🎁"
                : finalizeCost > 0
                  ? `Generate video · ${finalizeCost} tokens`
                  : "Generate video"}
            </Button3D>
          </div>
        </div>
      )}

      {/* -------------------------- Leave confirm ---------------------------- */}
      <Modal
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="Leave before the video is generated?"
        widthClass="max-w-[500px]"
      >
        <p className="text-[13px] leading-relaxed text-white/60">
          No worries — every scene edit is saved automatically. This draft will be waiting right
          here whenever you come back.{" "}
          {job.isEdit
            ? "Or discard the edits now and keep the original video untouched."
            : "Or discard the draft now and get its tokens refunded."}
        </p>
        {/* Discard pinned left, the stay/leave pair right; stacks (primary on
            top) when the modal is narrower than one row. */}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            disabled={discarding}
            onClick={() => void discard()}
            className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[13px] text-white/50 transition-colors hover:text-pulse disabled:opacity-50"
          >
            {discarding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            {job.isEdit ? "Discard edits" : "Discard draft"}
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button3D variant="secondary" onClick={() => setConfirmLeave(false)}>
              Keep editing
            </Button3D>
            <Button3D onClick={() => navigate(`/s/${songId}`)}>Save &amp; leave</Button3D>
          </div>
        </div>
      </Modal>

      {/* ------------------------- Discard confirm --------------------------- */}
      <Modal open={confirmDiscard} onClose={() => setConfirmDiscard(false)} title="Delete this draft?">
        <p className="text-[13px] leading-relaxed text-white/60">
          This deletes the whole in-progress video. Tokens you spent generating scenes are
          refunded for pre-rendered drafts.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button3D variant="secondary" onClick={() => setConfirmDiscard(false)}>
            Keep working
          </Button3D>
          <Button3D onClick={() => void discard()} disabled={discarding}>
            {discarding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete draft
          </Button3D>
        </div>
      </Modal>
    </div>
  );
}

/** A HelpCircle with an explainer bubble: hover on desktop, tap-to-toggle on
 *  touch (hover tooltips don't exist there). Mobile anchoring depends on where
 *  the icon sits: `end` (default) grows leftward from the icon — for icons
 *  near the RIGHT screen edge; `center` centers over the icon — for icons
 *  mid-row (a left-growing bubble there would clip off the LEFT edge).
 *  Desktop is always centered. */
function HelpTip({
  label,
  align = "end",
  children,
}: {
  label: string;
  align?: "end" | "center";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      onBlur={() => setOpen(false)}
      aria-label={label}
      aria-expanded={open}
      className="group relative flex items-center p-1.5 lg:p-0"
    >
      <HelpCircle
        className={cn(
          "h-5 w-5 cursor-help transition-colors group-hover:text-white/70 lg:h-3 lg:w-3",
          open ? "text-white/70" : "text-white/30",
        )}
      />
      <span
        className={cn(
          "pointer-events-none absolute bottom-full z-30 mb-1.5 w-[240px] max-w-[76vw] rounded-[10px] border border-white/10 bg-[#1c1c1c] p-2.5 text-left text-[10.5px] leading-snug text-white/70 shadow-xl",
          align === "center"
            ? "left-1/2 -translate-x-1/2"
            : "max-lg:right-0 lg:left-1/2 lg:-translate-x-1/2",
          open ? "block" : "hidden group-hover:block",
        )}
      >
        {children}
      </span>
    </button>
  );
}

/** Horizontal connector between pipeline nodes. Carries state through color:
 *  quiet white, red pulse while the downstream node generates, amber when the
 *  downstream is stale. The arrowhead makes the DIRECTION explicit — the right
 *  node is derived from the left one (image feeds motion). */
function Connector({ state }: { state: "idle" | "busy" | "stale" | "off" }) {
  if (state === "off") return <div className="hidden lg:block" />;
  return (
    <div className="relative hidden lg:block" aria-hidden>
      <div
        className={cn(
          "absolute left-0 right-[5px] top-1/2 h-[2px] -translate-y-1/2 rounded-full",
          state === "busy"
            ? "animate-pulse bg-pulse"
            : state === "stale"
              ? "bg-amber-400/70"
              : "bg-white/15",
        )}
      />
      {/* Arrowhead at the downstream end. */}
      <div
        className={cn(
          "absolute right-0 top-1/2 h-0 w-0 -translate-y-1/2 border-y-[5px] border-l-[7px] border-y-transparent",
          state === "busy"
            ? "animate-pulse border-l-pulse"
            : state === "stale"
              ? "border-l-amber-400/70"
              : "border-l-white/25",
        )}
      />
      {state === "stale" && (
        <AlertTriangle className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 text-amber-300" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One pipeline row: lyric lines ─▶ image node ─▶ clip node.
// ---------------------------------------------------------------------------
function SceneRow({
  seg,
  job,
  audioUrl,
  cast,
  state,
  interactive,
  supportsMotion,
  imageCost,
  clipCost,
  onRegenerateImage,
  onRegenerateMotion,
  onApplyPlates,
  onUngroup,
  onSetMode,
  dragging,
  onDragStart,
  onDragEnd,
  dropValid,
  onDropLine,
  hopTargets,
  hopBusy,
  onHopLine,
  onSegmentUpdated,
  registerRef,
  reducedMotion,
}: {
  seg: ReviewSegment;
  job: VideoJob;
  audioUrl: string | null;
  cast: string[];
  state: TaskState | undefined;
  interactive: boolean;
  supportsMotion: boolean;
  imageCost: number;
  clipCost: number;
  onRegenerateImage: (direction?: string, noCast?: boolean) => void;
  onRegenerateMotion: (motionDirection?: string, loopSeconds?: number) => void;
  onApplyPlates: () => void;
  onUngroup: () => void;
  onSetMode: (m: "baked" | "plates") => void;
  dragging: { scene: number; line: number; lines: number } | null;
  onDragStart: (lineIndex: number, lineCount: number) => void;
  onDragEnd: () => void;
  dropValid: boolean;
  onDropLine: () => void;
  /** Whether the previous/next scene can receive a hopped boundary line. */
  hopTargets: { up: boolean; down: boolean };
  hopBusy: boolean;
  onHopLine: (lineIndex: number, dir: -1 | 1) => void;
  onSegmentUpdated: (seg: ReviewSegment) => void;
  registerRef: (el: HTMLDivElement | null) => void;
  reducedMotion: boolean;
}) {
  const toast = useToast();
  const [direction, setDirection] = useState(seg.direction ?? "");
  const [noCast, setNoCast] = useState(seg.noCast);
  const [motionDir, setMotionDir] = useState(motionSeed(seg));
  // Plates: the user-chosen generated-loop length (null = the model's max).
  const [loopSecs, setLoopSecs] = useState<number | null>(seg.loopSeconds);

  useEffect(() => {
    setDirection(seg.direction ?? "");
    setNoCast(seg.noCast);
    setMotionDir(motionSeed(seg));
    setLoopSecs(seg.loopSeconds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seg.direction, seg.noCast, seg.motionDirection, seg.loopSeconds]);

  const busyImage = state?.kind === "image" && state.phase !== "error";
  const busyClip = state?.kind === "clip" && state.phase !== "error";
  const queued = state?.phase === "queued";
  const errored = state?.phase === "error";
  const generatingScene =
    !seg.imageUrl && (job.status === "pending" || job.status === "processing");
  const isPlates = seg.textMode === "plates";
  const isGroup = (seg.lines?.length ?? 0) > 1;
  // "One scene" jobs stack dozens of lines in one row — cap the lane and scroll.
  const dense = (seg.lines?.length ?? 0) > 8;
  // Legacy single-line segments don't expose sung times in the DTO — the scene
  // window is the honest timecode for them.
  const lines =
    seg.lines ?? (seg.text ? [{ text: seg.text, start: seg.clipStart, end: seg.clipEnd }] : []);
  const platesTotal = seg.lines?.filter((l) => l.text.trim()).length ?? 0;
  const span = seg.clipEnd - seg.clipStart;
  const clipMax = job.imageQuality === "lite" ? LITE_CLIP_MAX_SECONDS : GROK_MAX_SECONDS;
  const loops = supportsMotion && span > clipMax + 0.5;
  // Plates: selectable generated-loop lengths (the loop then tiles the window).
  // Lite has no 1s/3s: Seedance rejects clips under 4s (the server clamps to 4,
  // so shorter chips would silently lie). Grok generates down to 1s.
  const loopOptions = (job.imageQuality === "lite" ? [4, 8, 12] : [1, 3, 5, 10, 15]).filter(
    (s, _i, arr) => s <= Math.max(Math.ceil(span), arr[0]!),
  );

  const mentioned = cast.length > 0 ? findMentionedNames(direction, cast) : [];
  const motionMentioned = cast.length > 0 ? findMentionedNames(motionDir, cast) : [];

  async function saveMotion() {
    const next = motionDir.trim();
    if (next === (seg.motionDirection ?? motionSeed(seg))) return;
    try {
      const updated = await updateSegment(job.id, seg.index, { motionDirection: next || null });
      onSegmentUpdated(updated);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save the motion.", "error");
    }
  }

  // Tappable chips insert the mention AT THE CARET via the textarea's handle
  // (not appended at the end), and repeat taps insert again — a scene can
  // legitimately mention the same subject twice.
  const directionRef = useRef<MentionTextareaHandle>(null);
  const motionRef = useRef<MentionTextareaHandle>(null);

  return (
    <div
      ref={registerRef}
      onDragOver={(e) => {
        if (dropValid) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!dropValid) return;
        e.preventDefault();
        onDropLine();
      }}
      className={cn(
        // content-visibility keeps 81 rows cheap, but its paint containment
        // CLIPS anything reaching outside the row — including the @mention
        // dropdown. Lift it while a field inside is focused so the dropdown
        // can overflow the card; it re-engages on blur (dropdown closes then).
        "[contain-intrinsic-size:300px] [content-visibility:auto] focus-within:[content-visibility:visible]",
        // While focused, also raise the whole row above its siblings so the
        // dropdown floats over the next scene card instead of under it.
        "relative focus-within:z-30",
        "grid grid-cols-1 gap-3 rounded-[14px] border p-3 transition-colors lg:grid-cols-[minmax(200px,300px)_36px_minmax(0,1fr)_36px_minmax(0,1fr)] lg:gap-0",
        dropValid
          ? "border-pulse/60 bg-pulse/[0.05] shadow-[0_0_0_1px_rgba(255,45,45,0.35)]"
          : errored
            ? "border-pulse/40"
            : "border-white/[0.06] bg-white/[0.015]",
      )}
    >
      {/* Mobile scene header — with the nodes stacked, this is what marks where
          one scene ends and the next begins (and replaces the hidden rail as
          the "where am I" cue). Desktop reads scenes as grid rows instead. */}
      <div className="-mb-1 flex items-baseline justify-between text-[10px] uppercase tracking-[1.2px] text-white/35 lg:hidden">
        <span>
          Scene {seg.index + 1}
          <span className="text-white/20"> / {job.totalSegments}</span>
        </span>
        <span className="tabular-nums normal-case tracking-normal text-white/30">
          {fmtTime(seg.clipStart)}–{fmtTime(seg.clipEnd)}
        </span>
      </div>

      {/* ------------------------------ Lyrics lane ------------------------------ */}
      <div className="flex min-w-0 flex-col justify-center gap-1.5 lg:pr-2">
        {lines.length > 0 ? (
          <div
            className={cn(
              dense &&
                "rounded-[14px] border border-white/[0.07] bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
            )}
          >
            {dense && (
              <div className="flex items-baseline justify-between border-b border-white/[0.06] px-3 py-2">
                <span className="text-[10px] uppercase tracking-[1.2px] text-white/40">
                  {lines.length} lines
                </span>
                <span className="text-[10px] tabular-nums text-white/30">
                  {fmtTime(lines[0]!.start)}–{fmtTime(lines[lines.length - 1]!.end)}
                </span>
              </div>
            )}
            <div
              className={cn(
                "flex flex-col gap-1.5",
                dense &&
                  "max-h-[380px] overflow-y-auto p-2.5 [mask-image:linear-gradient(to_bottom,transparent,black_14px,black_calc(100%-14px),transparent)] [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin] lg:max-h-[440px]",
              )}
            >
              {lines.map((l, i) => {
                // Timing is fixed → only the boundary lines can hop to a neighbor.
                const draggable = interactive && (i === 0 || i === lines.length - 1);
                const isDragged = dragging?.scene === seg.index && dragging.line === i;
                return (
                  <div
                    key={i}
                    draggable={draggable}
                    onDragStart={(e) => {
                      if (!draggable) return;
                      e.dataTransfer.setData("text/plain", l.text);
                      e.dataTransfer.effectAllowed = "move";
                      onDragStart(i, lines.length);
                    }}
                    onDragEnd={onDragEnd}
                    title={
                      draggable
                        ? "Drag onto the scene above or below to move this line there."
                        : undefined
                    }
                    className={cn(
                      "flex w-fit max-w-full items-center gap-2 rounded-[14px] rounded-bl-[4px] border transition-all",
                      dense ? "px-2 py-1" : "px-2.5 py-1.5",
                      isDragged
                        ? "border-pulse/60 bg-pulse/10 opacity-50"
                        : "border-white/10 bg-white/[0.04]",
                      draggable && "cursor-grab hover:border-white/30 active:cursor-grabbing",
                    )}
                  >
                    <span className="shrink-0 rounded bg-black/40 px-1 py-px text-[9.5px] tabular-nums text-white/45">
                      {fmtTime(l.start)}
                    </span>
                    <span
                      className={cn(
                        "truncate leading-snug text-white/85",
                        dense ? "text-[12px]" : "text-[12.5px]",
                      )}
                    >
                      {l.text}
                    </span>
                    {/* Touch can't HTML5-drag — boundary lines get explicit ↑/↓
                        buttons that make the same neighbor hops the drag does. */}
                    {interactive &&
                      ((i === 0 && hopTargets.up) ||
                        (i === lines.length - 1 && hopTargets.down)) && (
                        <span className="ml-0.5 flex shrink-0 items-center gap-1 lg:hidden">
                          {i === 0 && hopTargets.up && (
                            <button
                              type="button"
                              disabled={hopBusy}
                              onClick={() => onHopLine(i, -1)}
                              aria-label="Move this line to the previous scene"
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-white/50 transition-colors active:bg-white/10 disabled:opacity-40"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                          )}
                          {i === lines.length - 1 && hopTargets.down && (
                            <button
                              type="button"
                              disabled={hopBusy}
                              onClick={() => onHopLine(i, 1)}
                              aria-label="Move this line to the next scene"
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-white/50 transition-colors active:bg-white/10 disabled:opacity-40"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex w-fit items-center gap-2 rounded-[14px] rounded-bl-[4px] border border-dashed border-white/10 px-2.5 py-1.5">
            <span className="shrink-0 rounded bg-black/40 px-1 py-px text-[9.5px] tabular-nums text-white/45">
              {fmtTime(seg.clipStart)}
            </span>
            <span className="text-[12px] italic text-white/35">Instrumental</span>
          </div>
        )}

        {/* Group controls: type + split. Comfortable tap sizes below lg; the
            compact desktop sizing is restored via lg: overrides. */}
        {isGroup && interactive && (
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            <div className="flex rounded-full border border-white/12 text-[12px] lg:text-[10px]">
              <button
                type="button"
                onClick={() => !isPlates || onSetMode("baked")}
                title="All lines painted into one image, shown together."
                className={cn(
                  "rounded-l-full px-3 py-1.5 transition-colors lg:px-2 lg:py-0.5",
                  !isPlates ? "bg-white/12 text-white" : "text-white/45 hover:text-white",
                )}
              >
                <Layers className="mr-1 inline h-3.5 w-3.5 lg:h-2.5 lg:w-2.5" />
                At once
              </button>
              <button
                type="button"
                onClick={() => isPlates || onSetMode("plates")}
                disabled={job.model !== "normal"}
                title={
                  job.model === "normal"
                    ? "One looping clip; lines appear one by one on their timing. (Experimental)"
                    : "Needs a Living Scenes video."
                }
                className={cn(
                  "relative rounded-r-full px-3 py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-35 lg:px-2 lg:py-0.5",
                  isPlates ? "bg-pulse/20 text-white" : "text-white/45 hover:text-white",
                )}
              >
                <Film className="mr-1 inline h-3.5 w-3.5 lg:h-2.5 lg:w-2.5" />
                In sequence
                {/* Floats above the control so the button stays compact. */}
                <span className="pointer-events-none absolute -top-[13px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-300/35 bg-stage px-1.5 py-px text-[7.5px] font-medium uppercase tracking-[0.8px] text-amber-200">
                  Experimental
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={onUngroup}
              title="Split back into one scene per line."
              className="flex items-center gap-1 rounded-full border border-white/12 px-3 py-1.5 text-[12px] text-white/45 transition-colors hover:border-white/30 hover:text-white lg:px-2 lg:py-0.5 lg:text-[10px]"
            >
              <Scissors className="h-3.5 w-3.5 lg:h-2.5 lg:w-2.5" />
              Split
            </button>
            <HelpTip label="What do these scene modes mean?">
              <b className="text-white">At once</b> — all lines are painted into one image and
              shown together for the whole scene.
              <br />
              <br />
              <b className="text-white">In sequence</b> — one clip loops for the whole scene
              while each line glows in at the moment it&rsquo;s sung, as styled text.
            </HelpTip>
          </div>
        )}
        {isGroup && seg.textMode === "overlay" && (
          <p className="mt-1 max-w-[210px] text-[10px] leading-snug text-amber-400/80">
            Text plates failed the quality check — these lines will render as timed subtitles
            in the final video. Switch back to &ldquo;In sequence&rdquo; to retry plates.
          </p>
        )}
        {isPlates && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-white/40">
            <span className="tabular-nums">
              {seg.platesReady}/{platesTotal} plates
            </span>
            {/* Dense groups get a progress bar; small ones rely on the "n/m
                plates" count alone (per-plate dots read as cryptic red circles
                — QA feedback — and were removed). */}
            {platesTotal > 8 && (
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-[#ff5151] to-pulse transition-[width] duration-500"
                  style={{ width: `${Math.round((seg.platesReady / Math.max(1, platesTotal)) * 100)}%` }}
                />
              </span>
            )}
            <span>
              {job.sceneGrouping === "single" && job.prerenderImages && !job.isEdit
                ? "· included in the up-front price"
                : `· ${platesTotal * singlePlateTokens()} tokens at render`}
            </span>
          </div>
        )}
      </div>

      {/* lines → image connector */}
      <Connector state={busyImage || generatingScene ? "busy" : "idle"} />

      {/* ------------------------------ Image node ------------------------------ */}
      <div className="min-w-0">
        {/* Mobile section label — stacked nodes need an explicit name for what
            this block IS. Desktop has the sticky column headers instead. */}
        <div className="mb-1.5 flex items-center gap-1.5 lg:hidden" aria-hidden>
          <ImageIcon className="h-3 w-3 text-white/45" />
          <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-white/45">
            Scene image
          </span>
          <span className="h-px flex-1 bg-white/[0.08]" />
        </div>
        <div className="relative aspect-video w-full overflow-hidden rounded-[10px] border border-white/10 bg-black">
          {seg.imageUrl ? (
            <motion.img
              key={seg.imageUrl}
              src={seg.imageUrl}
              alt=""
              loading="lazy"
              initial={reducedMotion ? false : { opacity: 0, filter: "blur(10px)", scale: 1.04 }}
              animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
              transition={{ type: "spring", stiffness: 120, damping: 22 }}
              className={cn("h-full w-full object-cover", busyImage && "opacity-20")}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2">
              {!busyImage && !generatingScene && (
                <>
                  <ImageIcon className="h-7 w-7 text-white/20" />
                  {/* Desktop teaching state: name the step so first-timers get
                      the pipeline order (image first, then motion). */}
                  {interactive && supportsMotion && !isPlates && (
                    <p className="hidden max-w-[85%] text-center text-[11px] leading-snug text-white/40 lg:block">
                      <span className="font-medium text-white/60">Step 1</span> — describe the
                      scene below and generate its image.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          {(busyImage || generatingScene) && <ImagePainting />}
          {queued && state?.kind === "image" && (
            <span className="absolute left-2 top-2 rounded bg-pulse/15 px-1.5 py-0.5 text-[10px] text-pulse backdrop-blur">
              Queued
            </span>
          )}
          {isPlates && (
            <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/70 backdrop-blur">
              text-free base
            </span>
          )}
        </div>

        {errored && state?.kind === "image" && (
          <div className="mt-1.5 flex items-start gap-2 rounded-[8px] border border-pulse/30 bg-pulse/[0.06] px-2 py-1 text-[10.5px] text-white/70">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-pulse" />
            <span className="line-clamp-3 leading-snug">{state.error ?? "Failed"}</span>
          </div>
        )}

        {interactive && (
          <div className="mt-2">
            <MentionTextarea
              ref={directionRef}
              value={direction}
              onChange={setDirection}
              names={cast}
              rows={2}
              placeholder={
                isPlates
                  ? "What should the backdrop scene show? (text-free — the lyrics arrive as plates)"
                  : seg.text
                    ? `Defaults to the lyric${isGroup ? " block" : ""}`
                    : "What should this scene show?"
              }
              className={FIELD}
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 max-lg:mb-3 max-lg:mt-3">
              {cast.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setNoCast(false);
                    directionRef.current?.insertMention(name);
                  }}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10.5px] transition-colors",
                    mentioned.includes(name)
                      ? "border-pulse/50 bg-pulse/10 text-white"
                      : "border-white/15 text-white/50 hover:border-white/35 hover:text-white",
                  )}
                >
                  @{name}
                </button>
              ))}
              {cast.length > 0 && (
                <button
                  type="button"
                  onClick={() => setNoCast((n) => !n)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] transition-colors",
                    noCast
                      ? "border-pulse/50 bg-pulse/10 text-white"
                      : "border-white/15 text-white/50 hover:border-white/35 hover:text-white",
                  )}
                >
                  <Ban className="h-2.5 w-2.5" />
                  No one
                </button>
              )}
              <button
                type="button"
                disabled={!!state && state.phase !== "error"}
                onClick={() => onRegenerateImage(direction, noCast)}
                className="ml-auto flex items-center gap-1.5 rounded-[9px] border border-pulse/40 bg-pulse/[0.08] px-2.5 py-1 text-[11.5px] font-medium text-white transition-colors hover:bg-pulse/[0.16] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RefreshCw className={cn("h-3 w-3", busyImage && "animate-spin")} />
                {isPlates
                  ? `${seg.imageUrl ? "Regenerate" : "Generate"} base · ${imageCost}`
                  : `${seg.imageUrl ? "Regenerate" : "Generate"} · ${imageCost}`}
              </button>
            </div>
            {isPlates && (
              <p className="mt-1 text-[10px] leading-snug text-white/35">
                <Sparkles className="mr-1 inline h-2.5 w-2.5" />
                Regenerating the base resets the loop and plates — they redo from the new scene.
              </p>
            )}
          </div>
        )}
      </div>

      {/* image → clip connector */}
      <Connector
        state={
          !supportsMotion
            ? "off"
            : busyClip
              ? "busy"
              : seg.clipStatus === "stale"
                ? "stale"
                : "idle"
        }
      />

      {/* ------------------------------ Clip node ------------------------------- */}
      {supportsMotion ? (
        <div className="min-w-0">
          {/* Mobile section label — separates this block from the image
              controls right above it (extra top margin is deliberate). */}
          <div className="mb-1.5 mt-3 flex items-center gap-1.5 lg:hidden" aria-hidden>
            <Film className="h-3 w-3 text-pulse/70" />
            <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-white/45">
              Motion clip
            </span>
            <span className="h-px flex-1 bg-white/[0.08]" />
          </div>
          <ClipPreview
            clipUrl={seg.clipUrl}
            audioUrl={audioUrl}
            clipStart={seg.clipStart}
            busy={busyClip}
            emptyState={
              // Desktop teaching states (mobile twin keeps the stock copy):
              // no image yet → the motion step is LOCKED, making the image →
              // motion dependency physical; image ready → it's "Step 2".
              interactive && !isPlates ? (
                <>
                  <div className="hidden flex-col items-center gap-2 lg:flex">
                    {seg.imageUrl ? (
                      <>
                        <Film className="h-7 w-7 text-white/30" />
                        <p className="text-[12.5px] text-white/55">No motion clip yet</p>
                        <p className="max-w-[85%] text-[11px] leading-snug text-white/35">
                          <span className="font-medium text-white/55">Step 2</span> — direct below
                          how the image should move, then generate.
                        </p>
                      </>
                    ) : (
                      <>
                        <Lock className="h-6 w-6 text-white/25" />
                        <p className="text-[12.5px] text-white/55">Waiting for the scene image</p>
                        <p className="max-w-[85%] text-[11px] leading-snug text-white/35">
                          <span className="font-medium text-white/55">Step 2</span> — motion
                          animates the scene image, so generate the image first.
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-2 lg:hidden">
                    <Film className="h-7 w-7 text-white/30" />
                    <p className="text-[12.5px] text-white/55">No motion clip yet</p>
                    <p className="max-w-[80%] text-[11px] text-white/35">
                      Generate to create &amp; preview this shot.
                    </p>
                  </div>
                </>
              ) : undefined
            }
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-white/40">
            <span className="tabular-nums">
              {fmtTime(seg.clipStart)}–{fmtTime(seg.clipEnd)}
            </span>
            {loops && (
              <span className="flex items-center gap-1 text-white/55" title="The clip is shorter than the scene — it ping-pong loops to fill it.">
                <Repeat className="h-2.5 w-2.5" />
                loops to fill
              </span>
            )}
            {seg.clipStatus === "stale" && (
              <span className="flex items-center gap-1 text-amber-300/85">
                <AlertTriangle className="h-2.5 w-2.5" />
                image changed — regenerates at render
              </span>
            )}
            {queued && state?.kind === "clip" && <span className="text-pulse">Queued</span>}
          </div>

          {errored && state?.kind === "clip" && (
            <div className="mt-1.5 flex items-start gap-2 rounded-[8px] border border-pulse/30 bg-pulse/[0.06] px-2 py-1 text-[10.5px] text-white/70">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-pulse" />
              <span className="line-clamp-3 leading-snug">{state.error ?? "Failed"}</span>
            </div>
          )}

          {interactive && (
            <div className="mt-2">
              <MentionTextarea
                ref={motionRef}
                value={motionDir}
                onChange={setMotionDir}
                onBlur={() => void saveMotion()}
                names={cast}
                rows={2}
                placeholder={
                  isPlates
                    ? "How should the loop move? (gentle, seamless motion works best)"
                    : "How should this shot move?"
                }
                className={FIELD}
              />
              {isPlates && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-white/35">Loop length</span>
                  {loopOptions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setLoopSecs(s)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10.5px] tabular-nums transition-colors",
                        (loopSecs ?? loopOptions[loopOptions.length - 1]) === s
                          ? "border-pulse/50 bg-pulse/10 text-white"
                          : "border-white/15 text-white/50 hover:border-white/35 hover:text-white",
                      )}
                    >
                      {s}s
                    </button>
                  ))}
                  <HelpTip label="How does the loop length work?" align="center">
                    <b className="text-white">Loop length</b> — how long a clip the motion model
                    generates. The clip then plays forward and backward on repeat to fill the whole
                    scene while each lyric line appears on its own timing.
                    <br />
                    <br />
                    Shorter = faster to generate. Longer = less visible repetition.
                  </HelpTip>
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 max-lg:mb-3 max-lg:mt-3">
                {cast.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => motionRef.current?.insertMention(name)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10.5px] transition-colors",
                      motionMentioned.includes(name)
                        ? "border-pulse/50 bg-pulse/10 text-white"
                        : "border-white/15 text-white/50 hover:border-white/35 hover:text-white",
                    )}
                  >
                    @{name}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={
                    (!!state && state.phase !== "error") || (!seg.imageUrl && !isPlates)
                  }
                  onClick={() => onRegenerateMotion(motionDir, isPlates ? (loopSecs ?? undefined) : undefined)}
                  className="ml-auto flex items-center gap-1.5 rounded-[9px] border border-pulse/40 bg-pulse/[0.08] px-2.5 py-1 text-[11.5px] font-medium text-white transition-colors hover:bg-pulse/[0.16] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RefreshCw className={cn("h-3 w-3", busyClip && "animate-spin")} />
                  {isPlates
                    ? `${seg.clipUrl ? "Regenerate" : "Generate"} loop · ${clipCost}`
                    : `${seg.clipUrl ? "Regenerate" : "Generate"} · ${clipCost}`}
                </button>
              </div>
              {isPlates && seg.clipUrl && !seg.platesApplied && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-[10px] border border-amber-400/25 bg-amber-400/[0.06] px-2.5 py-1.5">
                  <span className="text-[10.5px] leading-snug text-amber-200/85">
                    The loop plays without lyrics — apply them when the motion looks right.
                  </span>
                  <button
                    type="button"
                    disabled={!!state && state.phase !== "error"}
                    onClick={onApplyPlates}
                    className="flex shrink-0 items-center gap-1.5 rounded-[9px] border border-pulse/40 bg-pulse/[0.08] px-2.5 py-1 text-[11.5px] font-medium text-white transition-colors hover:bg-pulse/[0.16] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Sparkles className="h-3 w-3" />
                    Apply lyrics
                    {platesTotal - seg.platesReady > 0
                      ? ` · ${(platesTotal - seg.platesReady) * singlePlateTokens()}`
                      : " · free"}
                  </button>
                </div>
              )}
              {isPlates && (
                <p className="mt-1 text-[10px] leading-snug text-white/35">
                  <Repeat className="mr-1 inline h-2.5 w-2.5" />
                  One clip loops for the whole block while the {platesTotal} lines change on their
                  timing.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="hidden lg:block" />
      )}
    </div>
  );
}
