import { z } from "zod";

export const PLANS = ["free", "starter", "creator", "pro"] as const;
export const planSchema = z.enum(PLANS);
export type Plan = z.infer<typeof planSchema>;

export const accountSchema = z.object({
  plan: planSchema,
  monthlyQuota: z.number().nullable(),
  songsThisPeriod: z.number(),
  songsLifetime: z.number(),
  currentPeriodEnd: z.string().nullable(),
  hasSubscription: z.boolean(),
});
export type Account = z.infer<typeof accountSchema>;

export const PAID_TIERS = ["starter", "creator", "pro"] as const;
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
