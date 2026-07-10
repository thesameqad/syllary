import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ShowcaseSection, SongSummary } from "@syllary/shared";
import { getShowcase, listSongs } from "@/lib/api";
import { SongCard } from "@/components/dashboard/song-card";
import { MusicVideoCard, musicVideoSongs } from "@/components/dashboard/music-video-card";
import { ShowcaseRow } from "@/components/dashboard/showcase-row";

const ROW = 4;

export function DashboardPage() {
  const [mine, setMine] = useState<SongSummary[] | null>(null);
  const [showcase, setShowcase] = useState<ShowcaseSection[] | null>(null);

  const loadMine = useCallback(() => {
    listSongs()
      .then(setMine)
      .catch(() => setMine([]));
  }, []);

  useEffect(() => {
    loadMine();
    getShowcase()
      .then(setShowcase)
      .catch(() => setShowcase([]));
  }, [loadMine]);

  // Keep progress fresh while a lyric video is generating. A "review" draft is
  // parked on the user (not loading), so it doesn't warrant polling.
  useEffect(() => {
    if (!mine?.some((s) => s.videoActive && s.videoActive.status !== "review")) return;
    const t = setTimeout(loadMine, 4000);
    return () => clearTimeout(t);
  }, [mine, loadMine]);

  const videos = mine ? musicVideoSongs(mine).slice(0, ROW) : null;
  const recentSongs = mine ? mine.slice(0, ROW) : null;

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-medium tracking-[-0.6px]">Dashboard</h1>
        <Link
          to="/upload"
          className="rounded-full bg-pulse px-4 py-2 text-[13px] font-medium text-white transition-transform hover:scale-[1.03]"
        >
          Upload new song
        </Link>
      </div>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[15px] font-medium text-white">Your latest music videos</h2>
          <Link to="/recent" className="text-[12px] text-white/40 transition-colors hover:text-white">
            See all
          </Link>
        </div>
        {videos === null ? (
          <p className="text-[13px] text-white/35">Loading…</p>
        ) : videos.length === 0 ? (
          <p className="text-[13px] text-white/35">
            No music videos yet — open any song and hit &ldquo;Generate video&rdquo;.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {videos.map((song) => (
              <MusicVideoCard key={song.id} song={song} onChanged={loadMine} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[15px] font-medium text-white">Recently generated songs</h2>
          <Link to="/recent" className="text-[12px] text-white/40 transition-colors hover:text-white">
            See all
          </Link>
        </div>
        {recentSongs === null ? (
          <p className="text-[13px] text-white/35">Loading…</p>
        ) : recentSongs.length === 0 ? (
          <p className="text-[13px] text-white/35">
            You haven&rsquo;t created any lyrics yet — upload a song to get started.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {recentSongs.map((song) => (
              <SongCard key={song.id} song={song} />
            ))}
          </div>
        )}
      </section>

      {(showcase ?? []).length > 0 && (
        <section className="border-t border-white/[0.08] pt-10">
          <div className="mb-7">
            <h2 className="text-[26px] font-medium tracking-[-0.7px] text-white">
              From the community
            </h2>
            <p className="mt-1 text-[13px] text-white/45">
              Hand-picked public videos made with Syllary.
            </p>
          </div>
          <div className="space-y-8">
            {(showcase ?? []).map((section) => (
              <ShowcaseRow key={section.tag.id} section={section} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
