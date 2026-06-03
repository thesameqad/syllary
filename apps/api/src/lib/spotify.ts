import { env } from "../env.js";

// Spotify Web API client (app-only / client-credentials). Used to resolve a
// track's Spotify URL for the "Find links" feature — Odesli only reliably
// returns Spotify links when the lookup is SEEDED from a Spotify URL, so we
// search Spotify ourselves and feed that URL to Odesli. No-op (returns null)
// when SPOTIFY_CLIENT_ID/SECRET aren't configured.

let cached: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) return null;
  // Re-use the cached app token until ~5s before it expires.
  if (cached && cached.expiresAt > Date.now() + 5000) return cached.token;
  const basic = Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString(
    "base64",
  );
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    cached = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return cached.token;
  } catch {
    return null;
  }
}

export type SpotifyTrack = {
  url: string;
  artworkUrl: string | null;
  title: string | null;
  artist: string | null;
};

type SpotifySearchResponse = {
  tracks?: {
    items?: Array<{
      external_urls?: { spotify?: string };
      name?: string;
      artists?: { name?: string }[];
      album?: { images?: { url?: string }[] };
    }>;
  };
};

/** Find a track on Spotify by title + artist. Returns null when not configured,
 *  on any error, or when nothing matches. */
export async function searchSpotifyTrack(title: string, artist: string): Promise<SpotifyTrack | null> {
  const token = await getToken();
  if (!token) return null;
  const term = [artist, title]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  if (!term) return null;
  try {
    const res = await fetch(
      `https://api.spotify.com/v1/search?type=track&limit=5&q=${encodeURIComponent(term)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      // Surface the reason rather than silently falling back — the common one is
      // Spotify's "Active premium subscription required for the owner of the app"
      // (dev-mode apps need a Premium owner account to use the Web API).
      console.warn(`[spotify] search HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      return null;
    }
    const data = (await res.json()) as SpotifySearchResponse;
    const item = data.tracks?.items?.find((t) => t.external_urls?.spotify) ?? data.tracks?.items?.[0];
    const url = item?.external_urls?.spotify;
    if (!url) return null;
    return {
      url,
      artworkUrl: item?.album?.images?.[0]?.url ?? null,
      title: item?.name ?? null,
      artist: item?.artists?.map((a) => a.name).filter(Boolean).join(", ") || null,
    };
  } catch {
    return null;
  }
}
