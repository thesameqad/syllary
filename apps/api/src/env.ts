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
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z.string().default("google/gemini-2.5-flash"),
  // Used for reconciling multiple transcripts into canonical lyrics. Opus
  // handles explicit content reliably; Sonnet refuses some songs.
  OPENROUTER_RECONCILE_MODEL: z.string().default("anthropic/claude-opus-4.1"),
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
});

export const env = envSchema.parse(process.env);
