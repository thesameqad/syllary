import type { SongSummary } from "@syllary/shared";

// Client-side grouping for the hierarchical Library (Artists → Albums → Songs).
// Artist/album are free-text fields on each song (no entity tables), so we
// derive the hierarchy here. Songs missing metadata fall into sentinel buckets.

export const UNKNOWN_ARTIST = "Unknown Artist";
export const SINGLES = "Singles";

// Separator for the composite album key so two artists with an identically named
// album don't collide. Uses an obscure control char unlikely to appear in names.
const SEP = "␟";

export type ArtistGroup = {
  /** The artist label (also the value put in the URL). */
  name: string;
  cover: string | null;
  songCount: number;
  albumCount: number;
};

export type AlbumGroup = {
  /** Unique React key (artist + album). */
  key: string;
  album: string;
  artist: string;
  cover: string | null;
  songCount: number;
  songs: SongSummary[];
};

export function artistLabel(s: SongSummary): string {
  return s.artist?.trim() || UNKNOWN_ARTIST;
}

export function albumLabel(s: SongSummary): string {
  return s.album?.trim() || SINGLES;
}

/** Newest song (by createdAt) that has a cover, else null. */
function representativeCover(songs: SongSummary[]): string | null {
  return (
    [...songs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .find((s) => s.coverUrl)?.coverUrl ?? null
  );
}

/** Compare artist labels alphabetically, "Unknown Artist" last. */
function compareArtist(a: string, b: string): number {
  if (a === UNKNOWN_ARTIST) return b === UNKNOWN_ARTIST ? 0 : 1;
  if (b === UNKNOWN_ARTIST) return -1;
  return a.localeCompare(b);
}

/** Compare album labels alphabetically, "Singles" last. */
function compareAlbum(a: string, b: string): number {
  if (a === SINGLES) return b === SINGLES ? 0 : 1;
  if (b === SINGLES) return -1;
  return a.localeCompare(b);
}

export function groupByArtist(songs: SongSummary[]): ArtistGroup[] {
  const byArtist = new Map<string, SongSummary[]>();
  for (const s of songs) {
    const k = artistLabel(s);
    (byArtist.get(k) ?? byArtist.set(k, []).get(k)!).push(s);
  }
  return [...byArtist.entries()]
    .map(([name, items]) => ({
      name,
      cover: representativeCover(items),
      songCount: items.length,
      albumCount: new Set(items.map(albumLabel)).size,
    }))
    .sort((a, b) => compareArtist(a.name, b.name));
}

/** Build album groups from an already-filtered set of songs. */
function albumsFrom(songs: SongSummary[]): AlbumGroup[] {
  const byAlbum = new Map<string, SongSummary[]>();
  for (const s of songs) {
    const k = `${artistLabel(s)}${SEP}${albumLabel(s)}`;
    (byAlbum.get(k) ?? byAlbum.set(k, []).get(k)!).push(s);
  }
  return [...byAlbum.entries()]
    .map(([key, items]) => ({
      key,
      album: albumLabel(items[0]!),
      artist: artistLabel(items[0]!),
      cover: representativeCover(items),
      songCount: items.length,
      songs: sortSongs(items),
    }))
    .sort(
      (a, b) => compareArtist(a.artist, b.artist) || compareAlbum(a.album, b.album),
    );
}

/** Every album across all artists (the Albums tab). */
export function groupByAlbum(songs: SongSummary[]): AlbumGroup[] {
  return albumsFrom(songs);
}

/** Albums belonging to one artist (drill-down from the Artists tab). */
export function albumsForArtist(songs: SongSummary[], artist: string): AlbumGroup[] {
  return albumsFrom(songs.filter((s) => artistLabel(s) === artist));
}

/** Songs in one album of one artist, newest first. */
export function songsForAlbum(
  songs: SongSummary[],
  artist: string,
  album: string,
): SongSummary[] {
  return sortSongs(songs.filter((s) => artistLabel(s) === artist && albumLabel(s) === album));
}

function sortSongs(songs: SongSummary[]): SongSummary[] {
  return [...songs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
