import type { FaqItem, LandingBlock, LandingCategory, LandingRenderType } from "@syllary/shared";

/** A landing page authored as seed data. Mapped to a `landing_pages` row and
 *  validated against `createLandingSchema` before insert. */
export type SeedPage = {
  /** Full path after the domain, no leading slash. First segment === category. */
  slug: string;
  category: LandingCategory;
  renderType: LandingRenderType;
  toolKey?: string | null;
  title: string;
  /** ≤60 chars (enforced by the seeder). */
  metaTitle: string;
  /** ≤155 chars (enforced by the seeder). */
  metaDescription: string;
  blocks: LandingBlock[];
  faq?: FaqItem[] | null;
};

/** Tech/vendor names that must NEVER appear in user-facing copy (SYLLARY.md §10 /
 *  brief §3.3). The seeder word-boundary-scans every page and fails on a hit. */
export const BANNED_STRINGS = [
  "WAN",
  "Nano Banana",
  "FLUX",
  "ffmpeg",
  "Demucs",
  "Scribe",
  "ElevenLabs",
  "OpenRouter",
  "Gemini",
  "Grok",
  "Seedance",
  "Replicate",
  "fal.ai",
  "Clerk",
  "Supabase",
  "Drizzle",
  "wavesurfer",
  "Odesli",
] as const;

/** The ONLY tool_keys a render_type='tool' page may use — keep in sync with
 *  apps/web/src/tools/registry.tsx (the 12 live tools). */
export const VALID_TOOL_KEYS = [
  "format-converter",
  "lrc-validator",
  "lrc-offset-adjuster",
  "plain-lyrics-extractor",
  "lyrics-word-counter",
  "lyrics-preview-player",
  "lyric-timestamp-viewer",
  "lrc-editor",
  "duration-silence-detector",
  "streaming-link-finder",
  "song-summary-generator",
  "find-the-chorus",
] as const;

/** Shared CTA panel for every page (the universal funnel). */
export const UNIVERSAL_CTA: LandingBlock = {
  kind: "ctaCard",
  title: "One upload. Every lyric file — plus a page and a video.",
  text: "Upload your track and Syllary transcribes it, times every word, and gives you every lyrics format, a shareable lyrics page, and a lyric video where the words live inside the scene — all from one upload, for your own or AI-generated songs.",
  label: "Upload your track",
  href: "/",
};
