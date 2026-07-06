import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Music, Play } from "lucide-react";
import type { ShowcaseSection, ShowcaseVideo } from "@syllary/shared";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 4;

/** One hand-picked public video: cover card that hover-plays the video muted
 *  and links to the song's public page. */
function ShowcaseCard({ video }: { video: ShowcaseVideo }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);

  function startPreview() {
    const el = videoRef.current;
    if (!el) return;
    setPlaying(true);
    void el.play().catch(() => setPlaying(false));
  }
  function stopPreview() {
    const el = videoRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
    setPlaying(false);
  }

  return (
    <Link
      to={`/p/${video.songId}`}
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      className="group block overflow-hidden rounded-[14px] border border-white/[0.07] bg-stage/50 transition-colors hover:border-white/15"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-[linear-gradient(135deg,#2a0a0a,#0a0303)]">
        {video.coverUrl ? (
          <img
            src={video.coverUrl}
            alt=""
            className={cn(
              "h-full w-full object-cover transition-opacity duration-300",
              playing && "opacity-0",
            )}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Music className="h-8 w-8 text-pulse/40" />
          </div>
        )}
        {video.videoUrl && (
          <video
            ref={videoRef}
            src={video.videoUrl}
            muted
            loop
            playsInline
            preload="none"
            className={cn(
              "absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300",
              playing && "opacity-100",
            )}
          />
        )}
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur">
              <Play className="h-5 w-5" />
            </span>
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="truncate text-[13px] font-medium text-white">{video.title}</div>
        {video.artist && (
          <div className="mt-0.5 truncate text-[11px] text-white/40">{video.artist}</div>
        )}
      </div>
    </Link>
  );
}

/** A curated showcase row: 4 cards visible, arrow buttons page by 4. */
export function ShowcaseRow({ section }: { section: ShowcaseSection }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(section.videos.length / PAGE_SIZE));
  const visible = section.videos.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-medium text-white">
          The best public {section.tag.name.toLowerCase()} music videos
        </h2>
        {pages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Previous videos"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/12 text-white/60 transition-colors hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[11px] tabular-nums text-white/35">
              {page + 1}/{pages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              disabled={page >= pages - 1}
              aria-label="More videos"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/12 text-white/60 transition-colors hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {visible.map((v) => (
          <ShowcaseCard key={v.songId} video={v} />
        ))}
      </div>
    </section>
  );
}
