import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { DownloadCloud, Loader2, Music, Pencil, Upload } from "lucide-react";
import {
  type Album,
  type AlbumTrack,
  type Artist,
  FREE_SONG_LIMIT,
  type SongSummary,
} from "@syllary/shared";
import {
  ApiError,
  deleteAlbum,
  deleteArtist,
  deleteSong,
  getAccount,
  listAlbums,
  listArtists,
  listSongs,
  updateSong,
} from "@/lib/api";
import { SongCard, type SongCardManage } from "@/components/dashboard/song-card";
import { MusicVideoCard, musicVideoSongs } from "@/components/dashboard/music-video-card";
import { ArtistCard } from "@/components/dashboard/artist-card";
import { AlbumCard } from "@/components/dashboard/album-card";
import { LIBRARY_TABS, LibraryTabs, type LibraryTab } from "@/components/dashboard/library-tabs";
import { LibraryBreadcrumb, type Crumb } from "@/components/dashboard/library-breadcrumb";
import {
  EntityEditModal,
  type EntityEditTarget,
} from "@/components/dashboard/entity-edit-modal";
import { ImportCatalogModal } from "@/components/dashboard/import-catalog-modal";

const TILE_GRID = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4";
const VIDEO_GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";
const UNKNOWN = "unknown";
const SINGLES = "singles";

const lc = (s: string) => s.trim().toLowerCase();
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Spotify-style organized view, driven by real artist/album ENTITIES (so an
 *  imported album shows even before any audio is uploaded). Artists → Albums →
 *  Songs, plus a Music Videos tab. Untagged songs fall into Unknown Artist /
 *  Singles buckets. Drill-down lives in the URL. Flat list is at /recent. */
export function LibraryPage() {
  const [songs, setSongs] = useState<SongSummary[] | null>(null);
  const [artistRows, setArtistRows] = useState<Artist[]>([]);
  const [albumRows, setAlbumRows] = useState<Album[]>([]);
  const [plan, setPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const [editTarget, setEditTarget] = useState<EntityEditTarget | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    // Settle independently so a failing artists/albums call can't blank the page,
    // and a failed songs call sets an error (the poll effect retries) rather than
    // leaving "Loading…" stuck forever.
    const [s, ar, al] = await Promise.allSettled([listSongs(), listArtists(), listAlbums()]);
    if (s.status === "fulfilled") {
      setSongs(s.value);
      setError(null);
    } else {
      setError(s.reason instanceof ApiError ? s.reason.message : "Could not load your library.");
    }
    if (ar.status === "fulfilled") setArtistRows(ar.value);
    if (al.status === "fulfilled") setAlbumRows(al.value);
  }, []);

  useEffect(() => {
    void load();
    getAccount()
      .then((a) => setPlan(a.plan))
      .catch(() => undefined);
  }, [load]);

  useEffect(() => {
    const busy = songs?.some(
      (s) => s.status === "processing" || s.status === "pending" || s.videoActive,
    );
    // Also retry when the initial load hasn't succeeded yet (songs still null) so
    // a transient failure recovers on its own without a manual refresh.
    const needsRetry = songs === null;
    if (!busy && !needsRetry) return;
    const t = setTimeout(() => void load(), needsRetry ? 3000 : 4000);
    return () => clearTimeout(t);
  }, [songs, load]);

  const tabParam = params.get("tab");
  const tab: LibraryTab = (LIBRARY_TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as LibraryTab)
    : "artists";
  const artistId = params.get("artistId");
  const albumId = params.get("albumId");

  const go = useCallback(
    (next: { tab: LibraryTab; artistId?: string | null; albumId?: string | null }) => {
      const p: Record<string, string> = { tab: next.tab };
      if (next.artistId) p.artistId = next.artistId;
      if (next.albumId) p.albumId = next.albumId;
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

  const albumManage = useCallback(
    (album: Album) => ({
      onEdit: () =>
        setEditTarget({
          kind: "albums",
          id: album.id,
          name: album.name,
          coverUrl: album.coverUrl,
          releaseDate: album.releaseDate,
        }),
      onDelete: async () => {
        await deleteAlbum(album.id);
        await load();
      },
    }),
    [load],
  );

  const artistManage = useCallback(
    (artist: Artist) => ({
      onEdit: () =>
        setEditTarget({ kind: "artists", id: artist.id, name: artist.name, coverUrl: artist.coverUrl }),
      onDelete: async () => {
        await deleteArtist(artist.id);
        await load();
      },
    }),
    [load],
  );

  const all = useMemo(() => songs ?? [], [songs]);
  const videos = useMemo(() => musicVideoSongs(all), [all]);
  const artistById = useMemo(() => new Map(artistRows.map((a) => [a.id, a])), [artistRows]);
  const albumById = useMemo(() => new Map(albumRows.map((a) => [a.id, a])), [albumRows]);
  const songsByArtist = useMemo(() => {
    const m = new Map<string, SongSummary[]>();
    for (const s of all) if (s.artistId) (m.get(s.artistId) ?? m.set(s.artistId, []).get(s.artistId)!).push(s);
    return m;
  }, [all]);
  const songsByAlbum = useMemo(() => {
    const m = new Map<string, SongSummary[]>();
    for (const s of all) if (s.albumId) (m.get(s.albumId) ?? m.set(s.albumId, []).get(s.albumId)!).push(s);
    return m;
  }, [all]);
  const unknownArtistSongs = useMemo(() => all.filter((s) => !s.artistId), [all]);

  const sortedArtists = useMemo(
    () => [...artistRows].sort((a, b) => a.name.localeCompare(b.name)),
    [artistRows],
  );
  const sortedAlbums = useMemo(
    () => [...albumRows].sort((a, b) => a.name.localeCompare(b.name)),
    [albumRows],
  );

  const count = songs?.length ?? 0;

  function repCover(list: SongSummary[]): string | null {
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((s) => s.coverUrl)?.coverUrl ?? null;
  }

  function songGrid(list: SongSummary[]) {
    if (list.length === 0) return <p className="text-[14px] text-white/40">Nothing here.</p>;
    return (
      <div className={TILE_GRID}>
        {list.map((song) => (
          <SongCard key={song.id} song={song} manage={manage(song)} />
        ))}
      </div>
    );
  }

  function TrackRow({ track, song, artistName, albumName }: {
    track: AlbumTrack;
    song: SongSummary | undefined;
    artistName: string;
    albumName: string;
  }) {
    return (
      <div className="flex items-center gap-3 rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3 py-2">
        <span className="w-6 shrink-0 text-center text-[12px] text-white/30">{track.position ?? "•"}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-white/85">{track.title}</span>
        {song ? (
          <Link
            to={`/s/${song.id}`}
            className="shrink-0 rounded-full bg-success/[0.12] px-3 py-1 text-[11px] font-medium text-success"
          >
            {song.status === "ready" ? "Open lyrics" : "Processing…"}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() =>
              navigate(
                `/upload?artist=${encodeURIComponent(artistName)}&album=${encodeURIComponent(
                  albumName,
                )}&title=${encodeURIComponent(track.title)}`,
              )
            }
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/80 transition-colors hover:border-pulse/50 hover:text-white"
          >
            <Upload className="h-3 w-3 text-pulse" />
            Upload
          </button>
        )}
      </div>
    );
  }

  function albumDetail(album: Album, fromTab: "artists" | "albums") {
    const artistName = artistById.get(album.artistId)?.name ?? "Unknown Artist";
    const albumSongs = songsByAlbum.get(album.id) ?? [];
    // Tracks from the import that don't yet have an uploaded song (matched by
    // title). Once every track has audio, the checklist disappears and the album
    // shows as normal song tiles.
    const have = new Set(albumSongs.map((s) => lc(s.title)));
    const missing = album.tracks.filter((t) => !have.has(lc(t.title)));

    const crumbs: Crumb[] =
      fromTab === "albums"
        ? [{ label: "Albums", onClick: () => go({ tab: "albums" }) }, { label: album.name }]
        : [
            { label: "Artists", onClick: () => go({ tab: "artists" }) },
            { label: artistName, onClick: () => go({ tab: "artists", artistId: album.artistId }) },
            { label: album.name },
          ];

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <LibraryBreadcrumb crumbs={crumbs} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setEditTarget({
                  kind: "albums",
                  id: album.id,
                  name: album.name,
                  coverUrl: album.coverUrl,
                  releaseDate: album.releaseDate,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-pulse/50 hover:text-white"
            >
              <Pencil className="h-3.5 w-3.5 text-pulse" />
              Edit album
            </button>
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/upload?artist=${encodeURIComponent(artistName)}&album=${encodeURIComponent(album.name)}`,
                )
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-pulse/50 hover:text-white"
            >
              <Upload className="h-3.5 w-3.5 text-pulse" />
              Upload into this album
            </button>
          </div>
        </div>

        {albumSongs.length > 0 && songGrid(albumSongs)}

        {missing.length > 0 && (
          <div className={albumSongs.length > 0 ? "pt-2" : ""}>
            {albumSongs.length > 0 && (
              <h3 className="mb-2 text-[12px] font-medium text-white/70">
                {plural(missing.length, "track")} still to upload
              </h3>
            )}
            <div className="space-y-2">
              {missing.map((t, i) => (
                <TrackRow
                  key={`${t.title}-${i}`}
                  track={t}
                  song={undefined}
                  artistName={artistName}
                  albumName={album.name}
                />
              ))}
            </div>
          </div>
        )}

        {albumSongs.length === 0 && missing.length === 0 && (
          <p className="text-[14px] text-white/40">
            No songs yet — upload your audio for this album.
          </p>
        )}
      </div>
    );
  }

  function renderBody() {
    if (songs === null) return <p className="text-[14px] text-white/40">Loading…</p>;

    if (tab === "songs") return songGrid(all);

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

    // Album drilled (from either tab).
    if (albumId && albumId !== SINGLES) {
      const album = albumById.get(albumId);
      if (!album) return <p className="text-[14px] text-white/40">Album not found.</p>;
      return albumDetail(album, tab === "albums" ? "albums" : "artists");
    }

    // Albums tab root.
    if (tab === "albums") {
      if (sortedAlbums.length === 0)
        return <p className="text-[14px] text-white/40">No albums yet — import or upload one.</p>;
      return (
        <div className={TILE_GRID}>
          {sortedAlbums.map((a) => {
            const n = songsByAlbum.get(a.id)?.length ?? 0;
            const artistName = artistById.get(a.artistId)?.name ?? "Unknown Artist";
            const sub = [
              artistName,
              n > 0 ? plural(n, "song") : a.tracks.length > 0 ? plural(a.tracks.length, "track") : "0 songs",
              a.releaseDate ? a.releaseDate.slice(0, 4) : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <AlbumCard
                key={a.id}
                title={a.name}
                subtitle={sub}
                cover={a.coverUrl}
                onOpen={() => go({ tab: "albums", albumId: a.id })}
                manage={albumManage(a)}
              />
            );
          })}
        </div>
      );
    }

    // Artist drilled.
    if (artistId) {
      if (artistId === UNKNOWN) {
        return (
          <div className="space-y-4">
            <LibraryBreadcrumb
              crumbs={[
                { label: "Artists", onClick: () => go({ tab: "artists" }) },
                { label: "Unknown Artist" },
              ]}
            />
            {songGrid(unknownArtistSongs)}
          </div>
        );
      }
      const artist = artistById.get(artistId);
      if (!artist) return <p className="text-[14px] text-white/40">Artist not found.</p>;
      const artistAlbums = sortedAlbums.filter((a) => a.artistId === artistId);
      const singles = (songsByArtist.get(artistId) ?? []).filter((s) => !s.albumId);
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <LibraryBreadcrumb
              crumbs={[
                { label: "Artists", onClick: () => go({ tab: "artists" }) },
                { label: artist.name },
              ]}
            />
            <button
              type="button"
              onClick={() =>
                setEditTarget({ kind: "artists", id: artist.id, name: artist.name, coverUrl: artist.coverUrl })
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-pulse/50 hover:text-white"
            >
              <Pencil className="h-3.5 w-3.5 text-pulse" />
              Edit artist
            </button>
          </div>
          {artistAlbums.length === 0 && singles.length === 0 ? (
            <p className="text-[14px] text-white/40">No albums yet.</p>
          ) : (
            <div className={TILE_GRID}>
              {artistAlbums.map((a) => {
                const n = songsByAlbum.get(a.id)?.length ?? 0;
                const sub = [
                  n > 0 ? plural(n, "song") : a.tracks.length > 0 ? plural(a.tracks.length, "track") : "0 songs",
                  a.releaseDate ? a.releaseDate.slice(0, 4) : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <AlbumCard
                    key={a.id}
                    title={a.name}
                    subtitle={sub}
                    cover={a.coverUrl}
                    onOpen={() => go({ tab: "artists", artistId, albumId: a.id })}
                    manage={albumManage(a)}
                  />
                );
              })}
              {singles.length > 0 && (
                <AlbumCard
                  title="Singles"
                  subtitle={plural(singles.length, "song")}
                  cover={repCover(singles)}
                  onOpen={() => go({ tab: "artists", artistId, albumId: SINGLES })}
                />
              )}
            </div>
          )}
        </div>
      );
    }

    // Singles bucket of an artist (albumId=singles requires artistId).
    if (albumId === SINGLES && artistId) {
      const artist = artistById.get(artistId);
      const singles = (songsByArtist.get(artistId) ?? []).filter((s) => !s.albumId);
      return (
        <div className="space-y-4">
          <LibraryBreadcrumb
            crumbs={[
              { label: "Artists", onClick: () => go({ tab: "artists" }) },
              { label: artist?.name ?? "Artist", onClick: () => go({ tab: "artists", artistId }) },
              { label: "Singles" },
            ]}
          />
          {songGrid(singles)}
        </div>
      );
    }

    // Artists tab root.
    const cards = sortedArtists.map((a) => {
      const n = songsByArtist.get(a.id)?.length ?? 0;
      const albumCount = albumRows.filter((al) => al.artistId === a.id).length;
      const sub = [albumCount > 0 ? plural(albumCount, "album") : null, plural(n, "song")]
        .filter(Boolean)
        .join(" · ");
      return (
        <ArtistCard
          key={a.id}
          name={a.name}
          subtitle={sub}
          cover={a.coverUrl}
          onOpen={() => go({ tab: "artists", artistId: a.id })}
          manage={artistManage(a)}
        />
      );
    });
    if (sortedArtists.length === 0 && unknownArtistSongs.length === 0) {
      return <p className="text-[14px] text-white/40">No songs yet — upload or import one.</p>;
    }
    return (
      <div className={TILE_GRID}>
        {cards}
        {unknownArtistSongs.length > 0 && (
          <ArtistCard
            name="Unknown Artist"
            subtitle={plural(unknownArtistSongs.length, "song")}
            cover={repCover(unknownArtistSongs)}
            onOpen={() => go({ tab: "artists", artistId: UNKNOWN })}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-medium tracking-[-0.6px]">Library</h1>
          {plan === "free" && (
            <p className="mt-1 text-[12px] text-white/40">
              {count} of {FREE_SONG_LIMIT} songs · free tier
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] text-white/80 transition-colors hover:border-pulse/50 hover:text-white"
          >
            <DownloadCloud className="h-3.5 w-3.5 text-pulse" />
            Import from Deezer
          </button>
          <Link
            to="/upload"
            className="rounded-full bg-pulse px-4 py-2 text-[13px] font-medium text-white transition-transform hover:scale-[1.03]"
          >
            Upload new song
          </Link>
        </div>
      </div>

      <LibraryTabs active={tab} onSelect={(t) => go({ tab: t })} />

      {error && <p className="text-[13px] text-pulse">{error}</p>}

      {songs === null ? (
        <p className="inline-flex items-center gap-2 text-[14px] text-white/40">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : count === 0 && artistRows.length === 0 && albumRows.length === 0 ? (
        <p className="text-[14px] text-white/40">
          <Music className="mr-1.5 inline h-4 w-4" />
          Nothing yet — upload a track or import a catalog from Deezer.
        </p>
      ) : (
        renderBody()
      )}

      {editTarget && (
        <EntityEditModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => void load()}
        />
      )}
      {importOpen && (
        <ImportCatalogModal onClose={() => setImportOpen(false)} onImported={() => void load()} />
      )}
    </div>
  );
}
