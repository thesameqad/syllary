import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FREE_SONG_LIMIT, type SongSummary } from "@syllary/shared";
import { ApiError, deleteSong, getAccount, listSongs, updateSong } from "@/lib/api";
import { SongCard } from "@/components/dashboard/song-card";
import { MusicVideoCard, musicVideoSongs } from "@/components/dashboard/music-video-card";

/** Flat, newest-first list of everything the user has made — and where they land
 *  right after starting a generation, so they can watch it finish. (Formerly
 *  "Library"; the organized hierarchy now lives at /library.) */
export function RecentPage() {
  const [songs, setSongs] = useState<SongSummary[] | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSongs(await listSongs());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load your songs.");
    }
  }, []);

  useEffect(() => {
    void load();
    getAccount()
      .then((a) => setPlan(a.plan))
      .catch(() => undefined);
  }, [load]);

  // Poll while anything is still processing OR a lyric video is generating.
  useEffect(() => {
    const busy = songs?.some(
      (s) => s.status === "processing" || s.status === "pending" || s.videoActive,
    );
    if (!busy) return;
    const t = setTimeout(() => void load(), 4000);
    return () => clearTimeout(t);
  }, [songs, load]);

  const count = songs?.length ?? 0;
  const videos = songs ? musicVideoSongs(songs) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-medium tracking-[-0.6px]">Recent</h1>
          {plan === "free" && (
            <p className="mt-1 text-[12px] text-white/40">
              {count} of {FREE_SONG_LIMIT} songs · free tier
            </p>
          )}
        </div>
        <Link
          to="/upload"
          className="rounded-full bg-pulse px-4 py-2 text-[13px] font-medium text-white transition-transform hover:scale-[1.03]"
        >
          Upload new song
        </Link>
      </div>

      {error && <p className="text-[13px] text-pulse">{error}</p>}

      {songs === null ? (
        <p className="text-[14px] text-white/40">Loading…</p>
      ) : songs.length === 0 ? (
        <p className="text-[14px] text-white/40">No songs yet — upload your first track.</p>
      ) : (
        <div className="space-y-8">
          {videos.length > 0 && (
            <section>
              <h2 className="mb-4 text-[15px] font-medium text-white">Music videos</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {videos.map((song) => (
                  <MusicVideoCard key={song.id} song={song} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-4 text-[15px] font-medium text-white">Lyrics</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {songs.map((song) => (
                <SongCard
                  key={song.id}
                  song={song}
                  manage={{
                    onRename: async (title) => {
                      await updateSong(song.id, { title });
                      await load();
                    },
                    onTogglePublic: async () => {
                      await updateSong(song.id, { isPublic: !song.isPublic });
                      await load();
                    },
                    onDelete: async () => {
                      await deleteSong(song.id);
                      await load();
                    },
                  }}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
