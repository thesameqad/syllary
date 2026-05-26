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

/** Generation modes — a tradeoff curve between speed/cost and accuracy. */
export const GENERATION_MODES = ["fast", "normal", "pro"] as const;
export type GenerationMode = (typeof GENERATION_MODES)[number];

/** Cost multiplier per mode. The pipeline gets progressively more thorough,
 *  but we keep the price curve gentle so the right tool for the song never
 *  feels expensive. */
export const MODE_MULTIPLIER: Record<GenerationMode, number> = {
  fast: 1,
  normal: 1.5,
  pro: 2,
};

/** UI metadata for the mode picker. Descriptions are written for musicians,
 *  not engineers — they should guide the choice by genre/style rather than
 *  describe the internals. */
export const MODE_INFO: Record<
  GenerationMode,
  { label: string; tagline: string; description: string; eta: string }
> = {
  fast: {
    label: "Fast",
    tagline: "Great for most songs",
    description:
      "Works beautifully on acoustic, pop, singer-songwriter, ballads, country, lo-fi, and most tracks where the vocal sits clearly above the band. The quickest way to get clean, accurate lyrics.",
    eta: "≈ 1 min for a 5-min song",
  },
  normal: {
    label: "Normal",
    tagline: "For busier mixes",
    description:
      "A more careful pass for indie, R&B, soul, electronic, hip-hop, and anthemic pop — anything where the production is layered or the vocal weaves through a fuller arrangement.",
    eta: "≈ 1.5 min for a 5-min song",
  },
  pro: {
    label: "Pro",
    tagline: "For the hardest tracks",
    description:
      "Built for rock, metal, punk, hardcore, fast rap, drill, and anything with screams, growls, double-tracked vocals, or a wall of guitars. Catches words the other modes miss.",
    eta: "≈ 2.5 min for a 5-min song",
  },
};

/** Token cost for a track: 100 for the first minute, 50 for each additional
 *  minute (rounded to the nearest minute), multiplied by the mode tier. */
export function creditCost(durationSeconds: number, mode: GenerationMode = "pro"): number {
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  const base = 100 + 50 * (minutes - 1);
  return Math.round(base * MODE_MULTIPLIER[mode]);
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
