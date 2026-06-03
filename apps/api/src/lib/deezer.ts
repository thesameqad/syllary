// Deezer catalog resolver for the "import album/artist" feature. Deezer's public
// API is free and keyless (50 req/5s), so this needs no credentials — unlike
// Spotify. We pull the artist → albums → tracklist structure (names, covers,
// release dates) to pre-build the Library; audio is never imported.

const API = "https://api.deezer.com";

type DeezerArtist = { id: number; name: string; picture_xl?: string };
type DeezerTrack = { title: string; track_position?: number; duration?: number };
type DeezerAlbumLite = { id: number };
type DeezerAlbumFull = {
  id: number;
  title: string;
  cover_xl?: string;
  release_date?: string;
  artist?: { id: number; name: string };
  tracks?: { data: DeezerTrack[] };
};

export type ImportTrack = { title: string; position: number | null; durationSeconds: number | null };
export type ImportAlbum = {
  name: string;
  coverUrl: string | null;
  releaseDate: string | null;
  tracks: ImportTrack[];
};
export type ImportCatalog = {
  artistName: string;
  artistCoverUrl: string | null;
  albums: ImportAlbum[];
};

async function dz<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = (await r.json()) as T & { error?: unknown };
    if (j && typeof j === "object" && "error" in j && (j as { error?: unknown }).error) return null;
    return j;
  } catch {
    return null;
  }
}

/** Parse a Deezer artist/album reference from a URL or "artist:ID"/"album:ID". */
export function parseDeezerRef(input: string): { kind: "artist" | "album"; id: string } | null {
  const m = input.trim().match(/(artist|album)[/:](\d+)/i);
  if (m && m[1] && m[2]) {
    return { kind: m[1].toLowerCase() === "album" ? "album" : "artist", id: m[2] };
  }
  return null;
}

function mapAlbum(a: DeezerAlbumFull): ImportAlbum {
  const rd =
    a.release_date && /^\d{4}-\d{2}-\d{2}$/.test(a.release_date) ? a.release_date : null;
  return {
    name: a.title,
    coverUrl: a.cover_xl ?? null,
    releaseDate: rd,
    tracks: (a.tracks?.data ?? []).map((t) => ({
      title: t.title,
      position: t.track_position ?? null,
      durationSeconds: t.duration ?? null,
    })),
  };
}

/** Resolve a Deezer artist or album link into the catalog structure. Returns
 *  null on a bad link or any upstream failure (best-effort). */
export async function resolveDeezer(input: string): Promise<ImportCatalog | null> {
  const ref = parseDeezerRef(input);
  if (!ref) return null;

  if (ref.kind === "album") {
    const alb = await dz<DeezerAlbumFull>(`/album/${ref.id}`);
    if (!alb?.artist) return null;
    return { artistName: alb.artist.name, artistCoverUrl: null, albums: [mapAlbum(alb)] };
  }

  const artist = await dz<DeezerArtist>(`/artist/${ref.id}`);
  if (!artist) return null;
  const list = await dz<{ data?: DeezerAlbumLite[] }>(`/artist/${ref.id}/albums?limit=100`);
  const albums: ImportAlbum[] = [];
  for (const a of list?.data ?? []) {
    const full = await dz<DeezerAlbumFull>(`/album/${a.id}`);
    if (full) albums.push(mapAlbum(full));
  }
  return { artistName: artist.name, artistCoverUrl: artist.picture_xl ?? null, albums };
}

/** Download an external image (e.g. Deezer cover) into bytes for R2 upload. */
export async function fetchImageBuffer(
  url: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const buffer = Buffer.from(await r.arrayBuffer());
    if (buffer.length === 0) return null;
    return { buffer, contentType: r.headers.get("content-type") || "image/jpeg" };
  } catch {
    return null;
  }
}
