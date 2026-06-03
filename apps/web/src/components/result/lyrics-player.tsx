import { useEffect, useState, type ReactNode } from "react";
import { Pause, Pencil, Play } from "lucide-react";
import type { Lyrics } from "@syllary/shared";
import { useWavesurfer } from "@/hooks/use-wavesurfer";
import { DynamicLyrics } from "@/components/result/dynamic-lyrics";
import { SyncedLyrics } from "@/components/result/synced-lyrics";
import { InlineLineEditor } from "@/components/result/inline-line-editor";
import { DownloadBar } from "@/components/result/download-bar";
import { cn } from "@/lib/utils";

type LyricsMode = "dynamic" | "full";

export function LyricsPlayer({
  audioUrl,
  lyrics,
  title,
  meta,
  coverUrl = null,
  badge,
  toolbarLeft,
  baseName,
  showDownloads = false,
  lyricsAlign = "center",
  showViewLabel = false,
  belowLyrics,
  downloadsSlot,
  canEdit = false,
  onSaveLine,
  onSaveTitle,
  onInterceptEdit,
  onInterceptTitleEdit,
  onInterceptDownload,
}: {
  audioUrl: string | null;
  lyrics: Lyrics;
  title: string;
  meta: string;
  coverUrl?: string | null;
  badge?: ReactNode;
  toolbarLeft?: ReactNode;
  baseName: string;
  showDownloads?: boolean;
  lyricsAlign?: "center" | "left";
  showViewLabel?: boolean;
  belowLyrics?: ReactNode;
  downloadsSlot?: ReactNode;
  /** When true, lyric lines render a pencil-on-hover and become inline editable. */
  canEdit?: boolean;
  /** Called when the user commits an inline edit for a single line. Should
   *  persist the change (typically PATCH /songs/:id/lyrics with the full
   *  reconstructed text). Throw to keep the editor open. */
  onSaveLine?: (lineIndex: number, nextText: string) => Promise<void>;
  /** When provided (and canEdit), the song title becomes inline-editable via a
   *  hover pencil at the top-left. Should persist the new title. Throw to keep
   *  the editor open. */
  onSaveTitle?: (nextTitle: string) => Promise<void>;
  /** When provided and returns true, the pencil click is intercepted before
   *  entering inline edit mode (anonymous viewer → sign-in popup). */
  onInterceptEdit?: () => boolean;
  /** Like onInterceptEdit, but for the title pencil. */
  onInterceptTitleEdit?: () => boolean;
  /** When provided and returns true, download button clicks are intercepted
   *  (anonymous viewer → sign-in popup). */
  onInterceptDownload?: () => boolean;
}) {
  const { containerRef, isPlaying, currentTime, playPause, seek } = useWavesurfer(audioUrl);
  const [mode, setMode] = useState<LyricsMode>("dynamic");
  // Once the user explicitly picks a view (e.g. "full"), stop auto-switching it.
  const [userPickedMode, setUserPickedMode] = useState(false);
  const [editing, setEditing] = useState(false);

  function pickMode(m: LyricsMode) {
    setUserPickedMode(true);
    setMode(m);
  }

  // Focus the karaoke view when playback first starts — but only until the user
  // has chosen a view themselves. After that, playing (or editing then playing)
  // keeps whatever tab they're on instead of snapping back to dynamic.
  useEffect(() => {
    if (isPlaying && !userPickedMode) setMode("dynamic");
  }, [isPlaying, userPickedMode]);

  // Auto-pause when the user starts editing — so the active line doesn't move
  // out from under them mid-edit. We don't auto-resume on exit: let the user
  // decide when to keep listening.
  useEffect(() => {
    if (editing && isPlaying) playPause();
  }, [editing, isPlaying, playPause]);

  const hasLyrics = lyrics.lines.length > 0;

  return (
    <div className="overflow-hidden rounded-[20px] border-[0.5px] border-white/[0.08] bg-[linear-gradient(180deg,#161616_0%,#0d0d0d_100%)] shadow-[0_40px_80px_rgba(0,0,0,0.5),0_0_80px_rgba(255,45,45,0.06)]">
      <div className="p-6 sm:p-7">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={playPause}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="group relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-gradient-to-br from-[#FF2D2D] to-[#8B0000] text-white shadow-[0_4px_16px_rgba(255,45,45,0.4)] transition-transform hover:scale-105"
            >
              {coverUrl ? (
                <>
                  <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <span className="absolute inset-0 bg-black/35 transition-colors group-hover:bg-black/45" />
                </>
              ) : null}
              <span className="relative">
                {isPlaying ? (
                  <Pause className="h-5 w-5 fill-white" />
                ) : (
                  <Play className="h-5 w-5 fill-white" />
                )}
              </span>
            </button>
            <div className="min-w-0">
              {canEdit && onSaveTitle ? (
                <InlineLineEditor
                  original={title}
                  canEdit
                  align="left"
                  onSave={onSaveTitle}
                  onInterceptStart={onInterceptTitleEdit}
                  textClassName="text-[15px] font-medium"
                >
                  <span className="truncate text-[15px] font-medium text-white">{title}</span>
                </InlineLineEditor>
              ) : (
                <div className="truncate text-[15px] font-medium text-white">{title}</div>
              )}
              <div className="text-[12px] text-white/40">{meta}</div>
            </div>
          </div>
          {badge}
        </div>

        <div ref={containerRef} className="mb-6" />

        {hasLyrics ? (
          <>
            <div className="mb-4 flex items-center justify-between gap-2 border-b border-white/[0.05] pb-4">
              {toolbarLeft ?? <span />}
              <div className="flex items-center gap-2.5">
                {showViewLabel && (
                  <span className="text-[10px] uppercase tracking-[1.5px] text-white/40">View</span>
                )}
                <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#0a0a0a] p-0.5 text-[11px]">
                  {(["dynamic", "full"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => pickMode(m)}
                      className={cn(
                        "rounded-full px-3 py-1 capitalize transition-colors",
                        mode === m ? "bg-white text-[#0a0a0a]" : "text-white/55 hover:text-white",
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {canEdit && onSaveLine && (
              <p className="-mt-1 mb-3 inline-flex items-center gap-1.5 text-[11px] text-white/40">
                <Pencil className="h-3 w-3 text-pulse" />
                Hover any line to edit it in place.
              </p>
            )}
            {mode === "dynamic" ? (
              <DynamicLyrics
                lyrics={lyrics}
                currentTime={currentTime}
                onSeek={seek}
                align={lyricsAlign}
                canEdit={canEdit}
                onSaveLine={onSaveLine}
                onEditingChange={setEditing}
                onInterceptEdit={onInterceptEdit}
              />
            ) : (
              <SyncedLyrics
                lyrics={lyrics}
                currentTime={currentTime}
                onSeek={seek}
                canEdit={canEdit}
                onSaveLine={onSaveLine}
                onEditingChange={setEditing}
                onInterceptEdit={onInterceptEdit}
              />
            )}
            {belowLyrics}
          </>
        ) : (
          <p className="py-12 text-center text-[15px] text-white/40">
            No lyrics were detected in this track.
          </p>
        )}
      </div>

      {showDownloads && hasLyrics && (
        <div className="border-t border-white/[0.06] bg-black/20 px-6 py-5 sm:px-7">
          <h2 className="mb-3 text-[11px] uppercase tracking-[1.8px] text-white/40">
            Download for every platform
          </h2>
          {downloadsSlot ?? (
            <DownloadBar lyrics={lyrics} baseName={baseName} onIntercept={onInterceptDownload} />
          )}
        </div>
      )}
    </div>
  );
}
