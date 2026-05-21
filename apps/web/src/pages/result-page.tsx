import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Loader2, Pause, Play } from "lucide-react";
import type { Song } from "@syllary/shared";
import { ApiError, getSong } from "@/lib/api";
import { useWavesurfer } from "@/hooks/use-wavesurfer";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { LogoWordmark } from "@/components/logo";
import { SyncedLyrics } from "@/components/result/synced-lyrics";
import { DownloadBar } from "@/components/result/download-bar";

const LoadingScene = lazy(() => import("@/components/result/loading-scene"));

function baseNameOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const stem = dot === -1 ? filename : filename.slice(0, dot);
  return stem.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "lyrics";
}

function PageShell({ children }: { children: React.ReactNode }) {
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

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">{children}</div>;
}

export function ResultPage() {
  const { songId } = useParams<{ songId: string }>();
  const [song, setSong] = useState<Song | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!songId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const s = await getSong(songId);
        if (!active) return;
        setSong(s);
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
  }, [songId]);

  const isReady = song?.status === "ready";
  const { containerRef, isPlaying, currentTime, playPause, seek } = useWavesurfer(
    isReady ? song.audioUrl : null,
  );

  if (error) {
    return (
      <PageShell>
        <Centered>
          <AlertCircle className="mb-4 h-8 w-8 text-pulse" />
          <h1 className="text-[22px] font-medium">{error}</h1>
          <Link
            to="/"
            className="mt-6 rounded-full bg-pulse px-6 py-2.5 text-[14px] font-medium text-white"
          >
            Try another track
          </Link>
        </Centered>
      </PageShell>
    );
  }

  if (!song || song.status === "pending" || song.status === "processing") {
    const heading =
      song?.stage === "separating" ? "Isolating the vocals…" : "Transcribing your track…";
    return (
      <PageShell>
        <div className="relative h-[62vh] min-h-[440px]">
          {!reduced && (
            <div className="absolute inset-0">
              <Suspense fallback={null}>
                <LoadingScene stage={song?.stage ?? null} reducedMotion={false} />
              </Suspense>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-8 flex flex-col items-center text-center">
            {reduced && <Loader2 className="mb-5 h-9 w-9 animate-spin text-pulse" />}
            <h1 className="text-[24px] font-medium tracking-[-0.6px]">{heading}</h1>
            <p className="mt-2 text-[14px] text-white/50">
              {song?.originalFilename ?? "Working on it"} · this can take a minute or two
            </p>
            {!reduced && (
              <p className="mt-4 text-[12px] text-white/30">
                Move your mouse up to pump up the beat.
              </p>
            )}
          </div>
        </div>
      </PageShell>
    );
  }

  if (song.status === "failed") {
    return (
      <PageShell>
        <Centered>
          <AlertCircle className="mb-4 h-8 w-8 text-pulse" />
          <h1 className="text-[22px] font-medium tracking-[-0.5px]">We couldn&apos;t process that track</h1>
          <p className="mt-2 max-w-[420px] text-[14px] text-white/50">
            {song.error ?? "Something went wrong during transcription."}
          </p>
          <Link
            to="/"
            className="mt-6 rounded-full bg-pulse px-6 py-2.5 text-[14px] font-medium text-white"
          >
            Try another track
          </Link>
        </Centered>
      </PageShell>
    );
  }

  const lyrics = song.lyrics ?? { language: null, lines: [] };

  return (
    <PageShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-medium tracking-[-0.8px]">{song.originalFilename}</h1>
          <p className="mt-1 text-[13px] text-white/40">
            {lyrics.lines.length} lines
            {lyrics.language ? ` · ${lyrics.language.toUpperCase()}` : ""}
            {" · "}
            <span className="text-success">Platform-ready</span>
          </p>
        </div>
      </div>

      <div className="mb-8 flex items-center gap-4 rounded-[16px] border-[0.5px] border-white/[0.08] bg-stage/60 p-4">
        <button
          type="button"
          onClick={playPause}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pulse text-white shadow-[0_4px_20px_rgba(255,45,45,0.45)] transition-transform hover:scale-105"
        >
          {isPlaying ? <Pause className="h-5 w-5 fill-white" /> : <Play className="h-5 w-5 fill-white" />}
        </button>
        <div ref={containerRef} className="min-w-0 flex-1" />
      </div>

      <SyncedLyrics lyrics={lyrics} currentTime={currentTime} onSeek={seek} />

      {lyrics.lines.length > 0 && (
        <div className="mt-10 border-t border-white/[0.06] pt-6">
          <h2 className="mb-3 text-[12px] uppercase tracking-[1.5px] text-white/40">
            Download for every platform
          </h2>
          <DownloadBar lyrics={lyrics} baseName={baseNameOf(song.originalFilename)} />
        </div>
      )}

      <footer className="mt-12 border-t border-white/[0.04] pt-6 text-center text-[12px] text-white/30">
        Made with{" "}
        <Link to="/" className="text-white/50 hover:text-white">
          Syllary
        </Link>{" "}
        — turn any song into synced lyric files.
      </footer>
    </PageShell>
  );
}
