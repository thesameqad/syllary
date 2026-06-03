import type { LinkMatch, SongLink } from "@syllary/shared";
import { searchSpotifyTrack } from "./spotify.js";

// Find a track's streaming links automatically. Two entry points:
//   1. a pasted streaming URL (Spotify/Apple/YouTube/…) → fed straight to Odesli
//      (most accurate — no guessing), or
//   2. a title + artist → resolved to a canonical URL via Spotify search (best
//      Odesli seed; needs SPOTIFY_CLIENT_ID/SECRET) then the iTunes Search API
//      (no auth) as a fallback.
// Odesli (song.link) fans that single URL out to every platform. IMPORTANT:
// Odesli only returns a Spotify link when the lookup is SEEDED from a Spotify
// URL (an Apple/Deezer-seeded lookup omits Spotify even for huge tracks), so we
// resolve Spotify ourselves and (a) seed Odesli from it when we can, and (b)
// fill it back in afterwards if it's still missing. Both upstreams are
// best-effort — any failure returns an empty match rather than throwing.

type ItunesResult = {
  trackName?: string;
  artistName?: string;
  trackViewUrl?: string;
  artworkUrl100?: string;
};

type OdesliResponse = {
  entityUniqueId?: string;
  entitiesByUniqueId?: Record<
    string,
    { title?: string; artistName?: string; thumbnailUrl?: string }
  >;
  linksByPlatform?: Record<string, { url?: string }>;
};

async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "Syllary/1.0 (+https://syllary.com)" },
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Odesli platform key → our SongLink platform key. Listed in the precedence we
// want when two Odesli keys collapse to one of ours (e.g. youtubeMusic beats
// youtube). Keys not listed are skipped.
const ODESLI_PLATFORM_ORDER: [odesliKey: string, ourKey: string][] = [
  ["spotify", "spotify"],
  ["appleMusic", "apple_music"],
  ["itunes", "apple_music"],
  ["youtubeMusic", "youtube"],
  ["youtube", "youtube"],
  ["tidal", "tidal"],
  ["soundcloud", "soundcloud"],
  ["deezer", "deezer"],
  ["amazonMusic", "amazon_music"],
  ["pandora", "pandora"],
];

/** Find the canonical track URL (+ best-quality artwork) from a title + artist
 *  via the iTunes Search API. */
async function resolveFromSearch(
  title: string,
  artist: string,
): Promise<{ url: string; artworkUrl: string | null; trackName: string | null; artistName: string | null } | null> {
  const term = [artist, title]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  if (!term) return null;
  const search = (await fetchJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=5&media=music`,
  )) as { results?: ItunesResult[] } | null;
  const hit = search?.results?.find((r) => r.trackViewUrl) ?? search?.results?.[0];
  if (!hit?.trackViewUrl) return null;
  return {
    url: hit.trackViewUrl,
    // iTunes serves a 100px thumb; bump the size token for a usable cover.
    artworkUrl: hit.artworkUrl100 ? hit.artworkUrl100.replace(/\/\d+x\d+(bb)?\./, "/1000x1000$1.") : null,
    trackName: hit.trackName ?? null,
    artistName: hit.artistName ?? null,
  };
}

export async function matchStreamingLinks(opts: {
  title?: string;
  artist?: string;
  url?: string;
}): Promise<LinkMatch> {
  const empty: LinkMatch = { links: [], artworkUrl: null, matchedTitle: null, matchedArtist: null };

  // A pasted streaming URL goes straight to Odesli; otherwise resolve one from a
  // title + artist search first.
  const pasted = opts.url?.trim();
  let canonicalUrl: string | null = null;
  let artworkUrl: string | null = null;
  let matchedTitle: string | null = null;
  let matchedArtist: string | null = null;
  // The Spotify URL, tracked separately so we can guarantee it's in the result
  // even when Odesli drops it.
  let spotifyUrl: string | null = null;

  if (pasted && /^https?:\/\//i.test(pasted)) {
    canonicalUrl = pasted;
    if (/open\.spotify\.com/i.test(pasted)) spotifyUrl = pasted;
  } else {
    // Prefer a Spotify-seeded lookup (most complete Odesli graph + the link most
    // people want); fall back to iTunes when Spotify isn't configured/found.
    const sp = await searchSpotifyTrack(opts.title ?? "", opts.artist ?? "");
    if (sp) {
      canonicalUrl = sp.url;
      spotifyUrl = sp.url;
      artworkUrl = sp.artworkUrl;
      matchedTitle = sp.title;
      matchedArtist = sp.artist;
    } else {
      const found = await resolveFromSearch(opts.title ?? "", opts.artist ?? "");
      if (!found) return empty;
      canonicalUrl = found.url;
      artworkUrl = found.artworkUrl;
      matchedTitle = found.trackName;
      matchedArtist = found.artistName;
    }
  }

  // Fan the single canonical URL out to every platform via Odesli.
  const odesli = (await fetchJson(
    `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(canonicalUrl)}&userCountry=US&songIfSingle=true`,
  )) as OdesliResponse | null;
  const byPlatform = odesli?.linksByPlatform ?? {};

  const links: SongLink[] = [];
  const seen = new Set<string>();
  for (const [odesliKey, ourKey] of ODESLI_PLATFORM_ORDER) {
    const url = byPlatform[odesliKey]?.url;
    if (!url || seen.has(ourKey)) continue;
    seen.add(ourKey);
    links.push({ platform: ourKey, url });
  }
  // For a pasted Apple/iTunes URL that Odesli somehow didn't echo, keep it.
  if (!seen.has("apple_music") && /music\.apple\.com|itunes\.apple\.com/i.test(canonicalUrl)) {
    links.push({ platform: "apple_music", url: canonicalUrl });
  }

  // Pull title/artist/artwork from Odesli's entity when search didn't supply them
  // (i.e. the pasted-URL path).
  const entity = odesli?.entityUniqueId
    ? odesli.entitiesByUniqueId?.[odesli.entityUniqueId]
    : undefined;
  if (entity) {
    matchedTitle = matchedTitle ?? entity.title ?? null;
    matchedArtist = matchedArtist ?? entity.artistName ?? null;
    artworkUrl = artworkUrl ?? entity.thumbnailUrl ?? null;
  }

  // Guarantee Spotify: Odesli omits it unless seeded from Spotify, so if it's
  // still missing, resolve it directly (using the best title/artist we now have).
  if (!seen.has("spotify")) {
    if (!spotifyUrl) {
      const sp = await searchSpotifyTrack(
        matchedTitle ?? opts.title ?? "",
        matchedArtist ?? opts.artist ?? "",
      );
      if (sp) spotifyUrl = sp.url;
    }
    if (spotifyUrl) {
      seen.add("spotify");
      links.unshift({ platform: "spotify", url: spotifyUrl });
    }
  }

  return { links, artworkUrl, matchedTitle, matchedArtist };
}
