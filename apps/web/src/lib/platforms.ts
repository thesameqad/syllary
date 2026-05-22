export type PlatformMeta = {
  key: string;
  label: string;
  color: string;
  placeholder: string;
};

/** Known streaming platforms shown in the public-details editor (matches the
 *  "Listen on" wireframe). Custom platforms fall back to a neutral style. */
export const KNOWN_PLATFORMS: PlatformMeta[] = [
  { key: "spotify", label: "Spotify", color: "#1DB954", placeholder: "https://open.spotify.com/track/..." },
  { key: "apple_music", label: "Apple Music", color: "#FA243C", placeholder: "https://music.apple.com/us/album/..." },
  { key: "youtube", label: "YouTube", color: "#FF0000", placeholder: "https://music.youtube.com/watch?v=..." },
  { key: "bandcamp", label: "Bandcamp", color: "#629AA9", placeholder: "https://artist.bandcamp.com/track/..." },
  { key: "soundcloud", label: "SoundCloud", color: "#FF7700", placeholder: "https://soundcloud.com/artist/track" },
  { key: "tidal", label: "Tidal", color: "#7DD3FC", placeholder: "https://tidal.com/browse/track/..." },
];

export function titleCasePlatform(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function platformMeta(key: string): PlatformMeta {
  return (
    KNOWN_PLATFORMS.find((p) => p.key === key) ?? {
      key,
      label: titleCasePlatform(key),
      color: "#9A9A9A",
      placeholder: "",
    }
  );
}

/** Normalize a free-typed platform label into a stable key. */
export function platformKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}
