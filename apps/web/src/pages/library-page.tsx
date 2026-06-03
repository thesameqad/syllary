import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FREE_SONG_LIMIT, type SongSummary } from "@syllary/shared";
import { ApiError, deleteSong, getAccount, listSongs, updateSong } from "@/lib/api";
import { SongCard, type SongCardManage } from "@/components/dashboard/song-card";
import { MusicVideoCard, musicVideoSongs } from "@/components/dashboard/music-video-card";
import { ArtistCard } from "@/components/dashboard/artist-card";
import { AlbumCard } from "@/components/dashboard/album-card";
import {
  LIBRARY_TABS,
  LibraryTabs,
  type LibraryTab,
} from "@/components/dashboard/library-tabs";
import { LibraryBreadcrumb, type Crumb } from "@/components/dashboard/library-breadcrumb";
import {
  albumsForArtist,
  groupByAlbum,
  groupByArtist,
  songsForAlbum,
} from "@/lib/library";

const TILE_GRID = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4";
const VIDEO_GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";

/** Spotify-style organized view of the user's catalog: Artists → Albums → Songs,
 *  plus a Music Videos tab. Drill-down state lives in the URL so browser
 *  back/forward and deep links work. The flat newest-first list is at /recent. */
export function LibraryPage() {
  const [songs, setSongs] = useState<SongSummary[] | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();

  const load = useCallback(async () => {
    try {
      setSongs(await listSongs());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load your library.");
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

  // URL-derived view state.
  const tabParam = params.get("tab");
  const tab: LibraryTab = (LIBRARY_TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as LibraryTab)
    : "artists";
  const artist = params.get("artist");
  const album = params.get("album");

  const go = useCallback(
    (next: { tab: LibraryTab; artist?: string | null; album?: string | null }) => {
      const p: Record<string, string> = { tab: next.tab };
      if (next.artist) p.artist = next.artist;
      if (next.album) p.album = next.album;
      setParams(p);
    },
    [setParams],
  );

  const manage = useCallback(
    (song: SongSummary): SongCardManage => ({
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
    }),
    [load],
  );

  const all = useMemo(() => songs ?? [], [songs]);
  const artists = useMemo(() => groupByArtist(all), [all]);
  const albums = useMemo(() => groupByAlbum(all), [all]);
  const videos = useMemo(() => musicVideoSongs(all), [all]);

  const count = songs?.length ?? 0;

  function renderSongs(list: SongSummary[]) {
    if (list.length === 0) return <p className="text-[14px] text-white/40">Nothing here.</p>;
    return (
      <div className={TILE_GRID}>
        {list.map((song) => (
          <SongCard key={song.id} song={song} manage={manage(song)} />
        ))}
      </div>
    );
  }

  function renderBody() {
    if (songs === null) return <p className="text-[14px] text-white/40">Loading…</p>;
    if (songs.length === 0)
      return <p className="text-[14px] text-white/40">No songs yet — upload your first track.</p>;

    // Songs tab — flat grid.
    if (tab === "songs") return renderSongs(all);

    // Music Videos tab.
    if (tab === "videos") {
      if (videos.length === 0)
        return (
          <p className="text-[14px] text-white/40">
            No music videos yet — generate one from a track.
          </p>
        );
      return (
        <div className={VIDEO_GRID}>
          {videos.map((song) => (
            <MusicVideoCard key={song.id} song={song} />
          ))}
        </div>
      );
    }

    // Drilled into a specific album (reachable from both Artists and Albums tabs).
    if (artist && album) {
      const crumbs: Crumb[] =
        tab === "albums"
          ? [{ label: "Albums", onClick: () => go({ tab: "albums" }) }, { label: album }]
          : [
              { label: "Artists", onClick: () => go({ tab: "artists" }) },
              { label: artist, onClick: () => go({ tab: "artists", artist }) },
              { label: album },
            ];
      return (
        <div className="space-y-4">
          <LibraryBreadcrumb crumbs={crumbs} />
          {renderSongs(songsForAlbum(all, artist, album))}
        </div>
      );
    }

    // Artists tab, drilled into one artist → its albums.
    if (tab === "artists" && artist) {
      const artistAlbums = albumsForArtist(all, artist);
      return (
        <div className="space-y-4">
          <LibraryBreadcrumb
            crumbs={[{ label: "Artists", onClick: () => go({ tab: "artists" }) }, { label: artist }]}
          />
          {artistAlbums.length === 0 ? (
            <p className="text-[14px] text-white/40">Nothing here.</p>
          ) : (
            <div className={TILE_GRID}>
              {artistAlbums.map((g) => (
                <AlbumCard
                  key={g.key}
                  group={g}
                  showArtist={false}
                  onOpen={() => go({ tab: "artists", artist, album: g.album })}
                />
              ))}
            </div>
          )}
        </div>
      );
    }

    // Albums tab root — every album across all artists.
    if (tab === "albums") {
      return (
        <div className={TILE_GRID}>
          {albums.map((g) => (
            <AlbumCard
              key={g.key}
              group={g}
              onOpen={() => go({ tab: "albums", artist: g.artist, album: g.album })}
            />
          ))}
        </div>
      );
    }

    // Artists tab root.
    return (
      <div className={TILE_GRID}>
        {artists.map((g) => (
          <ArtistCard key={g.name} group={g} onOpen={() => go({ tab: "artists", artist: g.name })} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-medium tracking-[-0.6px]">Library</h1>
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

      <LibraryTabs active={tab} onSelect={(t) => go({ tab: t })} />

      {error && <p className="text-[13px] text-pulse">{error}</p>}

      {renderBody()}
    </div>
  );
}
