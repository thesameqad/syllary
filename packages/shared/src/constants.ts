// Upload + quota limits. 3-min cap; 60MB covers a 3-min WAV/FLAC.
export const MAX_FILE_BYTES = 60 * 1024 * 1024;
export const MAX_DURATION_SECONDS = 180;
export const ANONYMOUS_DAILY_LIMIT = 1;
// Signed-up free tier: lifetime allowance (no subscription).
export const FREE_SIGNED_UP_LIFETIME = 3;

// Credits (tokens). New accounts start with FREE_CREDITS; free tier may keep at
// most FREE_SONG_LIMIT songs in their library at once.
export const FREE_CREDITS = 1000;
export const FREE_SONG_LIMIT = 3;

/** Token cost for a track: 100 for the first minute, 50 for each additional
 *  minute (rounded to the nearest minute). */
export function creditCost(durationSeconds: number): number {
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  return 100 + 50 * (minutes - 1);
}

export const ACCEPTED_EXTENSIONS = [".mp3", ".wav", ".flac"] as const;

export const ACCEPTED_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/flac",
  "audio/x-flac",
] as const;

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

export function isAcceptedExtension(filename: string): boolean {
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(extensionOf(filename));
}
