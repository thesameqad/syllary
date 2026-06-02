import { ANONYMOUS_DAILY_LIMIT } from "@syllary/shared";
import { z } from "zod";

const envSchema = z.object({
  ANONYMOUS_DAILY_LIMIT: z.coerce.number().int().positive().default(ANONYMOUS_DAILY_LIMIT),
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  IP_HASH_SALT: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_ENDPOINT: z.string().url(),
  R2_PUBLIC_URL: z.string().url(),
  REPLICATE_API_TOKEN: z.string().min(1),
  // fal.ai key — used for ElevenLabs Scribe speech-to-text. Required for
  // transcription (the WhisperX flow on Replicate is no longer used).
  FAL_AI_KEY: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z.string().default("google/gemini-2.5-flash"),
  // Used for reconciling multiple transcripts into canonical lyrics. Opus
  // handles explicit content reliably; Sonnet refuses some songs.
  OPENROUTER_RECONCILE_MODEL: z.string().default("anthropic/claude-opus-4.1"),
  // Per-line backdrop generator for lyric videos, "Pro" quality tier. Gemini 3
  // Pro Image ("Nano Banana Pro") — best-in-class embedded-text rendering.
  OPENROUTER_IMAGE_MODEL: z.string().default("google/gemini-3-pro-image-preview"),
  // "Fast" quality tier (the default): Gemini 3.1 Flash Image ("Nano Banana 2")
  // — ~50% cheaper image generation at near-Pro quality. Users opt up to the Pro
  // model above (3× tokens) when they want the sharpest baked-in lyrics.
  OPENROUTER_IMAGE_MODEL_FAST: z.string().default("google/gemini-3.1-flash-image-preview"),
  // Cheap image-to-video model for Cinemagraph + Living Scenes. Grok Imagine is
  // the cheapest (~$0.05/s) AND supports short 1–15s clips, so we generate a
  // brief clip and loop it — far cheaper than Wan's forced 5/10s clips.
  OPENROUTER_VIDEO_MODEL: z.string().default("x-ai/grok-imagine-video"),
  // Image-to-video model for the "Cinematic" style. MUST support a last_frame
  // (Cinematic morphs each line's frame → the next line's frame for seamless,
  // scene-changing shots) — Grok does NOT (first_frame only), Seedance/Wan/Kling
  // do. Seedance 2.0 Fast is the cheapest confirmed first+last option.
  OPENROUTER_CINEMATIC_MODEL: z.string().default("bytedance/seedance-2.0-fast"),
  // Override the ffmpeg binary path. Defaults to the bundled ffmpeg-static
  // binary (works on Render's native runtime, no Docker); set this to use a
  // system install locally.
  FFMPEG_PATH: z.string().optional(),
  // Optional so the API still runs (anonymous-only) before auth/billing are configured.
  CLERK_SECRET_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_STARTER_MONTHLY: z.string().optional(),
  STRIPE_PRICE_STARTER_YEARLY: z.string().optional(),
  STRIPE_PRICE_CREATOR_MONTHLY: z.string().optional(),
  STRIPE_PRICE_CREATOR_YEARLY: z.string().optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PRO_YEARLY: z.string().optional(),
  // Music-video plans (large token grants; no song cap).
  STRIPE_PRICE_REEL_MONTHLY: z.string().optional(),
  STRIPE_PRICE_REEL_YEARLY: z.string().optional(),
  STRIPE_PRICE_STUDIO_MONTHLY: z.string().optional(),
  STRIPE_PRICE_STUDIO_YEARLY: z.string().optional(),
  STRIPE_PRICE_PREMIERE_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PREMIERE_YEARLY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
