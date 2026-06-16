import { useState } from "react";
import { Link } from "react-router-dom";
import { Clapperboard, Loader2, Music, Play, X } from "lucide-react";
import { VIDEO_MODEL_INFO, type SongSummary } from "@syllary/shared";
import { ApiError, cancelVideoJob } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

/** A library/dashboard card for a song's lyric video(s): shows live generation
 *  progress (with a Cancel for a stuck/unwanted job), or the finished styles. Links
 *  to the result page to watch. */
export function MusicVideoCard({
  song,
  onChanged,
}: {
  song: SongSummary;
  /** Called after a successful cancel so the list can refresh. */
  onChanged?: () => void;
}) {
  const toast = useToast();
  const active = song.videoActive;
  const [cancelling, setCancelling] = useState(false);
  const pct =
    active && active.totalSegments > 0
      ? Math.round((active.completedSegments / active.totalSegments) * 100)
      : 0;
  const count = song.videoModels.length;
  // Only a genuinely running job can be cancelled (a "review" job is a manual edit).
  const canCancel = !!active && (active.status === "pending" || active.status === "processing");

  async function cancel() {
    if (!active || cancelling) return;
    setCancelling(true);
    try {
      await cancelVideoJob(active.id);
      onChanged?.();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't cancel the generation.", "error");
      setCancelling(false);
    }
  }

  return (
    <Link
      to={`/s/${song.id}`}
      className="group block overflow-hidden rounded-[14px] border border-white/[0.07] bg-stage/50 transition-colors hover:border-white/15"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-[linear-gradient(135deg,#2a0a0a,#0a0303)]">
        {song.coverUrl ? (
          <img src={song.coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Music className="h-8 w-8 text-pulse/40" />
          </div>
        )}

        {active ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/72 p-3 text-center backdrop-blur-[1px]">
            <Loader2 className="h-6 w-6 animate-spin text-pulse" />
            <span className="text-[12px] font-medium text-white">
              Generating {VIDEO_MODEL_INFO[active.model].label}…
            </span>
            <div className="h-1.5 w-[72%] overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#ff5151] to-pulse"
                style={{ width: `${Math.max(pct, 5)}%` }}
              />
            </div>
            {canCancel && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void cancel();
                }}
                disabled={cancelling}
                className="mt-1 inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] text-white/80 transition-colors hover:border-pulse hover:bg-pulse/20 hover:text-white disabled:opacity-50"
              >
                {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                {cancelling ? "Cancelling…" : "Cancel"}
              </button>
            )}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur">
              <Play className="h-5 w-5" />
            </span>
          </div>
        )}

        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white/85 backdrop-blur">
          <Clapperboard className="h-3 w-3 text-pulse" />
          {active ? "Generating" : count === 1 ? "1 video" : `${count} videos`}
        </span>
      </div>

      <div className="p-3">
        <div className="truncate text-[13px] font-medium text-white">{song.title}</div>
        <div className="mt-0.5 truncate text-[11px] text-white/40">
          {active
            ? `${VIDEO_MODEL_INFO[active.model].label} · ${pct}%`
            : song.videoModels.map((m) => VIDEO_MODEL_INFO[m].label).join(" · ")}
        </div>
      </div>
    </Link>
  );
}

/** Songs that have a finished or in-progress lyric video, newest first. */
export function musicVideoSongs(songs: SongSummary[]): SongSummary[] {
  return songs
    .filter((s) => s.videoModels.length > 0 || s.videoActive)
    .sort((a, b) => (b.videoLatestAt ?? "").localeCompare(a.videoLatestAt ?? ""));
}
