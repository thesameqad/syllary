import { z } from "zod";

// Two plan families share one token wallet:
//  - Lyrics plans (starter/creator/pro): cheap, modest token grants.
//  - Music-video plans (reel/studio/premiere): pricier, large token grants for
//    video-heavy users. Tokens are interchangeable; video plans just grant a lot
//    more. See VIDEO_PLANS below + PLAN_CREDITS for the grants.
export const PLANS = ["free", "starter", "creator", "pro", "reel", "studio", "premiere"] as const;
export const planSchema = z.enum(PLANS);
export type Plan = z.infer<typeof planSchema>;

/** Plans tailored to music-video generation (large token grants, no song cap). */
export const VIDEO_PLANS = ["reel", "studio", "premiere"] as const;

/** Monthly token allowance granted per plan (free is granted once on signup).
 *  Video-plan grants use a 3× margin basis for Reel/Studio and a 2× basis for
 *  Premiere (the top tier is deliberately more generous per dollar). */
export const PLAN_CREDITS: Record<Plan, number> = {
  free: 1000,
  starter: 5000,
  creator: 15000,
  pro: 60000,
  reel: 80000,
  studio: 220000,
  premiere: 620000,
};

export const accountSchema = z.object({
  plan: planSchema,
  credits: z.number(),
  monthlyQuota: z.number().nullable(),
  songsThisPeriod: z.number(),
  songsLifetime: z.number(),
  currentPeriodEnd: z.string().nullable(),
  hasSubscription: z.boolean(),
  /** True when the signed-in user is in the admin allowlist (ADMIN_CLERK_IDS).
   *  Gates the landing-page management dashboard in the UI; the API enforces it
   *  independently. */
  isAdmin: z.boolean().default(false),
});
export type Account = z.infer<typeof accountSchema>;

export const PAID_TIERS = ["starter", "creator", "pro", "reel", "studio", "premiere"] as const;
export const BILLING_PERIODS = ["monthly", "annual"] as const;
export const billingPeriodSchema = z.enum(BILLING_PERIODS);
export type BillingPeriod = z.infer<typeof billingPeriodSchema>;

export const checkoutRequestSchema = z.object({
  tier: z.enum(PAID_TIERS),
  billingPeriod: billingPeriodSchema,
});
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export const checkoutResponseSchema = z.object({ url: z.string().url() });
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
