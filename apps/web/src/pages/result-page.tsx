import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  Clapperboard,
  ExternalLink,
  Pencil,
  Sparkles,
  SlidersHorizontal,
  Wand2,
  Zap,
} from "lucide-react";
import { lyricsToText, MODE_INFO, type Song, type VideoJob } from "@syllary/shared";
import { ApiError, getSong, updateSongLyrics } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { Button3D } from "@/components/ui/button-3d";
import { LogoWordmark } from "@/components/logo";
import { LyricsPlayer } from "@/components/result/lyrics-player";
import { LyricsEditModal } from "@/components/result/lyrics-editor";
import { GenerateVideoModal } from "@/components/result/generate-video-modal";
import { VideoTabs } from "@/components/result/video-tabs";
import { ManualSyncEditor } from "@/components/result/manual-sync-editor";
import { PublicDetailsModal } from "@/components/result/public-details-modal";
import { ProcessingView } from "@/components/result/processing-view";
import { RegenerateBanner } from "@/components/result/regenerate-banner";
import {
  SignInPromptModal,
  type SignInPromptReason,
} from "@/components/result/sign-in-prompt-modal";
import { DashboardChrome } from "@/components/dashboard/dashboard-layout";
import { authConfigured } from "@/lib/auth";

function durationLabel(seconds: number | null): string {
  if (seconds == null) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function baseNameOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const stem = dot === -1 ? filename : filename.slice(0, dot);
  return stem.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "lyrics";
}

/** Standalone shell for anonymous visitors (own header + centered column). */
function StandaloneShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-void text-white">
      <header className="border-b border-white/[0.04]">
        <div className="mx-auto flex max-w-[860px] items-center justify-between px-6 py-4">
          <Link to="/" aria-label="Syllary home">
            <LogoWordmark />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[13px] text-white/50 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            New track
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-[860px] px-6 py-10">{children}</div>
    </main>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">{children}</div>
  );
}

export function ResultPage() {
  return authConfigured ? <ResultPageAuthAware /> : <ResultPageInner signedIn={false} />;
}

function ResultPageAuthAware() {
  const { isLoaded, isSignedIn } = useAuth();
  return <ResultPageInner signedIn={isLoaded && !!isSignedIn} />;
}

// Signed-in users get the dashboard chrome; anonymous visitors the standalone
// shell. Defined at module scope so the component reference is stable across
// re-renders — otherwise React unmounts/remounts the subtree (including the
// WaveSurfer player) on every parent re-render, which would reset playback.
function Frame({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  return signedIn ? (
    <DashboardChrome>
      <div className="mx-auto max-w-[860px]">{children}</div>
    </DashboardChrome>
  ) : (
    <StandaloneShell>{children}</StandaloneShell>
  );
}

function ResultPageInner({ signedIn }: { signedIn: boolean }) {
  const { songId } = useParams<{ songId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [song, setSong] = useState<Song | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [activeVideoJob, setActiveVideoJob] = useState<VideoJob | null>(null);
  const [videoNoticeOpen, setVideoNoticeOpen] = useState(false);
  const videoSectionRef = useRef<HTMLDivElement>(null);
  const [signInPromptReason, setSignInPromptReason] = useState<SignInPromptReason | null>(null);
  const toast = useToast();

  // Anonymous viewers see the same affordances as the owner (Edit lyrics, Edit
  // public details, inline edit, regenerate, downloads) but every action opens
  // the sign-in prompt instead of mutating server state.
  const promptSignIn = (reason: SignInPromptReason) => {
    setSignInPromptReason(reason);
  };
  const interceptFor =
    (reason: SignInPromptReason) =>
    (): boolean => {
      if (signedIn) return false;
      promptSignIn(reason);
      return true;
    };

  // Auto-open the editor when arriving via `?edit=1` (e.g. the library menu),
  // but only for the owner. Clear the param so reloads don't reopen it.
  const wantsEdit = searchParams.get("edit") === "1";
  useEffect(() => {
    if (wantsEdit && song?.status === "ready" && song.canEdit) {
      setEditorOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [wantsEdit, song?.status, song?.canEdit, setSearchParams]);

  // Polling re-runs whenever status transitions to/from processing — so a
  // regenerate (ready → processing) automatically restarts the poll chain.
  const status = song?.status;
  useEffect(() => {
    if (!songId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const s = await getSong(songId);
        if (!active) return;
        setSong(s);
        // Resume an in-progress lyric-video job after a reload/navigation.
        setActiveVideoJob((prev) => prev ?? s.activeVideoJob);
        if (s.status === "pending" || s.status === "processing") {
          timer = setTimeout(() => void poll(), 3000);
        }
      } catch (err) {
        if (active) setError(err instanceof ApiError ? err.message : "Could not load this track.");
      }
    };

    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [songId, status]);

  // Lyric-video generation: the modal kicks off the job, then hands it here so
  // progress shows inside the video player while the user is free to roam.
  const handleVideoStarted = useCallback((job: VideoJob) => {
    setActiveVideoJob(job);
    setVideoOpen(false);
    setVideoNoticeOpen(true);
    setTimeout(
      () => videoSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      200,
    );
  }, []);

  const handleVideoDone = useCallback(() => {
    setActiveVideoJob(null);
    if (songId) {
      void getSong(songId)
        .then((s) => setSong((prev) => ({ ...s, audioUrl: prev?.audioUrl ?? s.audioUrl })))
        .catch(() => undefined);
    }
    toast("Your lyric video is ready 🎬");
  }, [songId, toast]);

  const handleVideoFailed = useCallback(
    (message: string) => {
      setActiveVideoJob(null);
      toast(message, "error");
    },
    [toast],
  );

  if (error) {
    return (
      <Frame signedIn={signedIn}>
        <Centered>
          <AlertCircle className="mb-4 h-8 w-8 text-pulse" />
          <h1 className="text-[22px] font-medium">{error}</h1>
          <Link to="/" className="mt-6 rounded-full bg-pulse px-6 py-2.5 text-[14px] font-medium text-white">
            Try another track
          </Link>
        </Centered>
      </Frame>
    );
  }

  if (!song || song.status === "pending" || song.status === "processing") {
    return (
      <Frame signedIn={signedIn}>
        <ProcessingView
          stage={song?.stage ?? null}
          filename={song?.originalFilename ?? "Working on it"}
        />
      </Frame>
    );
  }

  if (song.status === "failed") {
    return (
      <Frame signedIn={signedIn}>
        <div className="mx-auto max-w-[560px]">
          <div className="flex flex-col items-center text-center">
            <AlertCircle className="mb-4 h-8 w-8 text-pulse" />
            <h1 className="text-[22px] font-medium tracking-[-0.5px]">
              We couldn&apos;t process that track
            </h1>
            <p className="mt-2 max-w-[420px] text-[14px] text-white/50">
              {song.error ?? "Something went wrong during transcription."}
            </p>
            <Link
              to="/"
              className="mt-6 rounded-full border border-white/15 bg-white/[0.04] px-6 py-2.5 text-[14px] font-medium text-white/80 transition-colors hover:bg-white/[0.08]"
            >
              Try another track
            </Link>
          </div>
          {(song.canEdit || !signedIn) && (
            <RegenerateBanner
              songId={song.id}
              currentMode={song.mode ?? "fast"}
              durationSeconds={song.durationSeconds}
              variant="retry-failed"
              onIntercept={!signedIn ? interceptFor("regenerate") : undefined}
            />
          )}
        </div>
        <SignInPromptModal
          open={signInPromptReason !== null}
          reason={signInPromptReason ?? "regenerate"}
          onClose={() => setSignInPromptReason(null)}
        />
      </Frame>
    );
  }

  const lyrics = song.lyrics ?? { language: null, lines: [] };
  const meta = [
    durationLabel(song.durationSeconds),
    lyrics.language ? lyrics.language.toUpperCase() : "",
    `${lyrics.lines.length} lines`,
  ]
    .filter(Boolean)
    .join(" · ");

  // Apply a server-side update without re-rendering the audio element. R2
  // presigns a fresh signature on every response, but the underlying audio
  // file is unchanged. Swapping the URL would tear down and re-init WaveSurfer
  // (resetting playback to 0), so we keep the URL we mounted with.
  function applyUpdate(updated: Song) {
    setSong((prev) => ({ ...updated, audioUrl: prev?.audioUrl ?? updated.audioUrl }));
  }

  // Persist a single inline edit by rebuilding the editable text document with
  // the one line swapped and PATCHing the existing /songs/:id/lyrics endpoint
  // (which already realigns text against the original word timestamps).
  async function saveLine(lineIndex: number, nextText: string): Promise<void> {
    if (!song) return;
    const current = song.lyrics;
    if (!current) return;
    const nextLines = current.lines.map((l, i) =>
      i === lineIndex ? { ...l, text: nextText } : l,
    );
    const text = lyricsToText({ language: current.language, lines: nextLines });
    try {
      const updated = await updateSongLyrics(song.id, text);
      applyUpdate(updated);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save that edit.", "error");
      throw e;
    }
  }

  // Anonymous viewers get the same edit/regenerate UI as the owner; the
  // intercept callbacks open the sign-in popup instead of mutating state.
  const showOwnerUi = song.canEdit || !signedIn;
  const showInlineEdit = song.canEdit || !signedIn;

  return (
    <Frame signedIn={signedIn}>
      <LyricsPlayer
        audioUrl={song.audioUrl}
        lyrics={lyrics}
        title={song.originalFilename}
        meta={meta}
        baseName={baseNameOf(song.originalFilename)}
        showDownloads
        canEdit={showInlineEdit}
        onSaveLine={
          song.canEdit
            ? saveLine
            : !signedIn
              ? async () => {
                  // Should not be reachable because onInterceptEdit blocks the
                  // pencil click before edit mode opens. Keep a safe no-op so
                  // the inline editor still renders its UI affordance.
                  promptSignIn("inline-edit");
                }
              : undefined
        }
        onInterceptEdit={!signedIn ? interceptFor("inline-edit") : undefined}
        onInterceptDownload={!signedIn ? interceptFor("download") : undefined}
        badge={
          <div className="flex shrink-0 items-center gap-2">
            {song.mode && (
              <span
                title={MODE_INFO[song.mode].description}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-[5px] text-[11px] font-medium text-white/80"
              >
                {song.mode === "fast" && <Zap className="h-3 w-3 text-pulse" />}
                {song.mode === "normal" && <Wand2 className="h-3 w-3 text-pulse" />}
                {song.mode === "pro" && <Sparkles className="h-3 w-3 text-pulse" />}
                {MODE_INFO[song.mode].label} mode
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/[0.12] px-3 py-[5px] text-[11px] font-medium text-success">
              <span className="h-[5px] w-[5px] rounded-full bg-success" />
              Platform-ready
            </span>
          </div>
        }
        toolbarLeft={
          showOwnerUi || song.isPublic ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {song.canEdit && (
                <motion.button
                  type="button"
                  onClick={() => setVideoOpen(true)}
                  style={{ transformPerspective: 600 }}
                  whileHover={{ y: -2, rotateX: -7, scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 420, damping: 22 }}
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-b from-[#ff5151] to-[#d81818] px-3.5 py-1.5 text-[12px] font-medium text-white shadow-[0_8px_20px_-8px_rgba(255,45,45,0.7),inset_0_1px_0_rgba(255,255,255,0.35)]"
                >
                  <Clapperboard className="h-3.5 w-3.5" />
                  Generate video
                </motion.button>
              )}
              {showOwnerUi && (
                <button
                  type="button"
                  onClick={() =>
                    song.canEdit ? setEditorOpen(true) : promptSignIn("edit-lyrics")
                  }
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-pulse/50 hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5 text-pulse" />
                  Edit lyrics
                </button>
              )}
              {showOwnerUi && (
                <button
                  type="button"
                  onClick={() =>
                    song.canEdit ? setDetailsOpen(true) : promptSignIn("edit-details")
                  }
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-pulse/50 hover:text-white"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-pulse" />
                  Public details
                </button>
              )}
              {showOwnerUi && (
                <button
                  type="button"
                  onClick={() =>
                    song.canEdit ? setSyncOpen(true) : promptSignIn("sync-timing")
                  }
                  title="Drag each word into place on a full-song timeline"
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-pulse/50 hover:text-white"
                >
                  <Wand2 className="h-3.5 w-3.5 text-pulse" />
                  Timing
                </button>
              )}
              {song.isPublic && (
                <a
                  href={`/p/${song.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-pulse/50 hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-pulse" />
                  Public view
                </a>
              )}
            </div>
          ) : undefined
        }
        belowLyrics={
          <>
            {song.canEdit && (song.videos.length > 0 || activeVideoJob) && (
              <div ref={videoSectionRef}>
                <VideoTabs
                  song={song}
                  activeJob={activeVideoJob}
                  onUpdate={applyUpdate}
                  onJobComplete={handleVideoDone}
                  onJobFailed={handleVideoFailed}
                />
              </div>
            )}
            {showOwnerUi && song.mode && song.mode !== "pro" ? (
              <RegenerateBanner
                songId={song.id}
                currentMode={song.mode}
                durationSeconds={song.durationSeconds}
                onIntercept={!signedIn ? interceptFor("regenerate") : undefined}
              />
            ) : null}
          </>
        }
      />

      <footer className="mt-10 text-center text-[12px] text-white/30">
        Made with{" "}
        <Link to="/" className="text-white/50 hover:text-white">
          Syllary
        </Link>{" "}
        — turn any song into synced lyric files.
      </footer>

      <SignInPromptModal
        open={signInPromptReason !== null}
        reason={signInPromptReason ?? "download"}
        onClose={() => setSignInPromptReason(null)}
      />

      {song.canEdit && (
        <>
          <LyricsEditModal
            open={editorOpen}
            song={song}
            onClose={() => setEditorOpen(false)}
            onSaved={(updated) => {
              applyUpdate(updated);
              setEditorOpen(false);
            }}
          />
          <PublicDetailsModal
            open={detailsOpen}
            song={song}
            onClose={() => setDetailsOpen(false)}
            onSaved={(updated) => {
              applyUpdate(updated);
              setDetailsOpen(false);
            }}
          />
          <ManualSyncEditor
            open={syncOpen}
            song={song}
            onClose={() => setSyncOpen(false)}
            onSaved={(updated) => {
              applyUpdate(updated);
              setSyncOpen(false);
            }}
          />
          <GenerateVideoModal
            open={videoOpen}
            song={song}
            onClose={() => setVideoOpen(false)}
            onStarted={handleVideoStarted}
          />
        </>
      )}

      <Modal
        open={videoNoticeOpen}
        onClose={() => setVideoNoticeOpen(false)}
        title="Your video is on the way"
        widthClass="max-w-[460px]"
      >
        <div className="text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-pulse to-[#8B0000] text-white shadow-[0_8px_22px_-6px_rgba(255,45,45,0.6)]">
            <Clapperboard className="h-6 w-6" />
          </span>
          <h3 className="text-[16px] font-medium text-white">We&apos;re creating your video</h3>
          <p className="mx-auto mt-2 max-w-[380px] text-[13px] leading-relaxed text-white/55">
            This takes a few minutes. While you wait, why not explore lyric videos and tracks shared
            by other artists in the <span className="text-white/80">public music</span> section? We&apos;ll
            pop a note here the moment it&apos;s ready — the progress is showing in the player below.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Link to="/dashboard">
              <Button3D variant="secondary">Browse public music</Button3D>
            </Link>
            <Button3D onClick={() => setVideoNoticeOpen(false)}>Got it</Button3D>
          </div>
        </div>
      </Modal>
    </Frame>
  );
}
