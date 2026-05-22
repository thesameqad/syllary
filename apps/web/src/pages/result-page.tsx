import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { AlertCircle, ArrowLeft, ExternalLink, Pencil, SlidersHorizontal } from "lucide-react";
import type { Song } from "@syllary/shared";
import { ApiError, getSong } from "@/lib/api";
import { LogoWordmark } from "@/components/logo";
import { LyricsPlayer } from "@/components/result/lyrics-player";
import { LyricsEditModal } from "@/components/result/lyrics-editor";
import { PublicDetailsModal } from "@/components/result/public-details-modal";
import { ProcessingView } from "@/components/result/processing-view";
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

function ResultPageInner({ signedIn }: { signedIn: boolean }) {
  const { songId } = useParams<{ songId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [song, setSong] = useState<Song | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Signed-in users get the dashboard chrome; anonymous visitors the standalone shell.
  const Frame = ({ children }: { children: ReactNode }) =>
    signedIn ? (
      <DashboardChrome>
        <div className="mx-auto max-w-[860px]">{children}</div>
      </DashboardChrome>
    ) : (
      <StandaloneShell>{children}</StandaloneShell>
    );

  // Auto-open the editor when arriving via `?edit=1` (e.g. the library menu),
  // but only for the owner. Clear the param so reloads don't reopen it.
  const wantsEdit = searchParams.get("edit") === "1";
  useEffect(() => {
    if (wantsEdit && song?.status === "ready" && song.canEdit) {
      setEditorOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [wantsEdit, song?.status, song?.canEdit, setSearchParams]);

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

  if (error) {
    return (
      <Frame>
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
      <Frame>
        <ProcessingView
          stage={song?.stage ?? null}
          filename={song?.originalFilename ?? "Working on it"}
        />
      </Frame>
    );
  }

  if (song.status === "failed") {
    return (
      <Frame>
        <Centered>
          <AlertCircle className="mb-4 h-8 w-8 text-pulse" />
          <h1 className="text-[22px] font-medium tracking-[-0.5px]">
            We couldn&apos;t process that track
          </h1>
          <p className="mt-2 max-w-[420px] text-[14px] text-white/50">
            {song.error ?? "Something went wrong during transcription."}
          </p>
          <Link to="/" className="mt-6 rounded-full bg-pulse px-6 py-2.5 text-[14px] font-medium text-white">
            Try another track
          </Link>
        </Centered>
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

  return (
    <Frame>
      <LyricsPlayer
        audioUrl={song.audioUrl}
        lyrics={lyrics}
        title={song.originalFilename}
        meta={meta}
        baseName={baseNameOf(song.originalFilename)}
        showDownloads
        badge={
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/[0.12] px-3 py-[5px] text-[11px] font-medium text-success">
            <span className="h-[5px] w-[5px] rounded-full bg-success" />
            Platform-ready
          </span>
        }
        toolbarLeft={
          song.canEdit || song.isPublic ? (
            <div className="flex items-center gap-2">
              {song.canEdit && (
                <button
                  type="button"
                  onClick={() => setEditorOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-pulse/50 hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5 text-pulse" />
                  Edit lyrics
                </button>
              )}
              {song.canEdit && (
                <button
                  type="button"
                  onClick={() => setDetailsOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-pulse/50 hover:text-white"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-pulse" />
                  Edit public details
                </button>
              )}
              {song.isPublic && (
                <a
                  href={`/p/${song.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-pulse/50 hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-pulse" />
                  Open public view
                </a>
              )}
            </div>
          ) : undefined
        }
      />

      <footer className="mt-10 text-center text-[12px] text-white/30">
        Made with{" "}
        <Link to="/" className="text-white/50 hover:text-white">
          Syllary
        </Link>{" "}
        — turn any song into synced lyric files.
      </footer>

      {song.canEdit && (
        <>
          <LyricsEditModal
            open={editorOpen}
            song={song}
            onClose={() => setEditorOpen(false)}
            onSaved={(updated) => {
              setSong(updated);
              setEditorOpen(false);
            }}
          />
          <PublicDetailsModal
            open={detailsOpen}
            song={song}
            onClose={() => setDetailsOpen(false)}
            onSaved={(updated) => {
              setSong(updated);
              setDetailsOpen(false);
            }}
          />
        </>
      )}
    </Frame>
  );
}
