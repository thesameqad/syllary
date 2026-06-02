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

// ===========================================================================
// Lyrics video generation
// ===========================================================================

/** The three lyric-video styles, in ascending order of motion. Internal keys are
 *  stable DB values; user-facing names are friendly and non-technical.
 *    fast   → Slideshow     (still frames + gentle ffmpeg drift)
 *    normal → Living Scenes (the whole scene moves, via Grok)
 *    pro    → Cinematic     (full AI-directed clip, via Kling) */
export const VIDEO_MODELS = ["fast", "normal", "pro"] as const;
export type VideoModel = (typeof VIDEO_MODELS)[number];

export const VIDEO_MODEL_INFO: Record<
  VideoModel,
  {
    label: string;
    tagline: string;
    description: string;
    eta: string;
    costHint: string;
    /** Seconds of the song this style renders for now (cost control), or null
     *  for the full song. The AI-video styles are capped; slideshow is not. */
    previewSeconds: number | null;
    enabled: boolean;
    /** Still rough / unpredictable — surfaced as an "Experimental" badge. */
    experimental?: boolean;
  }
> = {
  fast: {
    label: "Slideshow",
    tagline: "Still scenes, gentle drift",
    description:
      "A gorgeous AI scene for every line, with your lyrics woven right into the artwork. Each scene slowly drifts and glides — clean, elegant, and the quickest way to a finished video.",
    eta: "Ready in a few minutes",
    costHint: "Lowest cost",
    previewSeconds: null,
    enabled: true,
  },
  normal: {
    label: "Living Scenes",
    tagline: "The whole scene moves",
    description:
      "A separate moving scene for each line — light shifts, clouds and traffic drift, the world comes alive behind your lyrics. Lots of motion, with each line its own standalone shot.",
    eta: "Takes a few minutes",
    costHint: "Higher cost",
    previewSeconds: null,
    enabled: true,
  },
  pro: {
    label: "Cinematic",
    tagline: "A real music video",
    description:
      "One continuous film — an AI director makes every shot flow smoothly into the next, with dynamic camera moves and evolving scenes, like a true music video. The richest, most premium result.",
    eta: "The most involved to create",
    costHint: "Premium",
    previewSeconds: null,
    enabled: true,
    experimental: true,
  },
};

/** Seconds rendered for a preview — a cheap sample starting at the first lyric
 *  line, so users can try a style before committing to the full spend. */
export const PREVIEW_SECONDS = 10;

/** Autopilot renders the whole video end-to-end; manual lets the owner review
 *  and regenerate each line before stitching. */
export const VIDEO_PIPELINE_MODES = ["autopilot", "manual"] as const;
export type VideoPipelineMode = (typeof VIDEO_PIPELINE_MODES)[number];

/** Backdrop image-model tier, orthogonal to resolution. Fast = Nano Banana 2
 *  (cheaper, near-Pro quality); Pro = Nano Banana Pro (best embedded-text
 *  rendering, pricier). Internal keys are stable DB values. The actual token
 *  price is computed per-song from real cost — see `estimateVideoCost` in
 *  video-plan.ts. */
export const IMAGE_QUALITIES = ["fast", "pro"] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

export const IMAGE_QUALITY_INFO: Record<
  ImageQuality,
  { label: string; description: string; enabled: boolean }
> = {
  fast: {
    label: "Fast",
    description: "Cheapest, beautiful scenes — but the lyric text can occasionally render with typos.",
    enabled: true,
  },
  pro: {
    label: "Pro",
    description: "Renders the lyric text precisely (far fewer typos), plus the sharpest detail. Costs more.",
    enabled: true,
  },
};


/** One-tap visual style presets for the lyric-video generator. `description` is
 *  the short, friendly line shown to the user; `prompt` is the full art-direction
 *  text actually sent to the image model (NOT shown, to avoid confusing them). A
 *  preview image is served from `/presets/{id}.jpg`. */
export type VideoStylePreset = {
  id: string;
  name: string;
  description: string;
  prompt: string;
};

export const VIDEO_STYLE_PRESETS: VideoStylePreset[] = [
  {
    id: "sunny-suburbs",
    name: "Sunny Suburbs",
    description: "Warm golden-hour homes and blue-sky nostalgia",
    prompt:
      "A sunny day in the suburbs: golden-hour sunlight, manicured green lawns, white picket fences, pastel-colored houses, clear blue sky with soft clouds, warm cheerful nostalgic Americana, gentle lens flares, cinematic depth of field, high detail",
  },
  {
    id: "cyberpunk-neon",
    name: "Cyberpunk Neon",
    description: "Rain-slick streets glowing with neon",
    prompt:
      "Cyberpunk megacity at night: rain-slick streets, towering skyscrapers drenched in glowing neon signage and holograms, magenta and cyan light, volumetric haze, reflections, Blade Runner mood, moody cinematic, ultra detailed",
  },
  {
    id: "nyc-night",
    name: "NYC After Dark",
    description: "The glossy night streets of New York",
    prompt:
      "The night streets of New York City: glossy wet asphalt, yellow-cab light trails, steam rising from manhole covers, towering lit skyscrapers and bodega signs, moody cinematic street photography, deep contrast, atmospheric, film-grain",
  },
  {
    id: "japanese-manga",
    name: "Japanese Manga",
    description: "Bold black-and-white ink panels",
    prompt:
      "Japanese manga art style: bold black-and-white ink linework, dramatic screentones and halftones, expressive speed lines, high-contrast monochrome shading, dynamic hand-drawn comic energy",
  },
  {
    id: "comic-book",
    name: "Comic Book",
    description: "Vivid inked panels with halftone pop",
    prompt:
      "Classic American comic book art: bold black ink outlines, vibrant saturated colors, Ben-Day halftone dots, dramatic cel shading, pop-art energy, dynamic poster composition",
  },
  {
    id: "3d-cartoon",
    name: "3D Cartoon",
    description: "Playful, glossy animated-movie look",
    prompt:
      "Playful 3D animated cartoon style: soft rounded shapes, bright cheerful colors, glossy Pixar-like rendering, charming whimsical world, soft global illumination, shallow depth of field, high quality render",
  },
];

/** Backdrop resolution from Nano Banana Pro. 1K is ~1376px (soft once scaled to
 *  1080p), 2K (~2048px) is crisp at 1080p, 4K is maximum detail. */
export const IMAGE_SIZES = ["1K", "2K", "4K"] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

export const IMAGE_SIZE_INFO: Record<
  ImageSize,
  { label: string; description: string; enabled: boolean }
> = {
  "1K": { label: "1K", description: "Fastest, lowest cost — a little soft at 1080p.", enabled: true },
  "2K": { label: "2K", description: "Crisp at 1080p. The best balance.", enabled: true },
  "4K": { label: "4K", description: "Maximum detail. Slower and pricier.", enabled: true },
};

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
