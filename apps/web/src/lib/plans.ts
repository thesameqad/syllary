import { FIRST_SUB_BONUS, PLAN_CREDITS, type Plan } from "@syllary/shared";

export const PLAN_ORDER: Record<Plan, number> = {
  free: 0,
  starter: 1,
  creator: 2,
  pro: 3,
  reel: 4,
  studio: 5,
  premiere: 6,
};
export const PLAN_LABEL: Record<Plan, string> = {
  free: "Free",
  starter: "Starter",
  creator: "Creator",
  pro: "Pro",
  reel: "Reel",
  studio: "Studio",
  premiere: "Premiere",
};

export type PlanFeature = { text: string; comingSoon?: boolean };

export type PlanTier = {
  id: "starter" | "creator" | "pro" | "reel" | "studio" | "premiere";
  /** Which pricing family the plan belongs to. */
  category: "lyrics" | "video";
  name: string;
  desc: string;
  monthly: number;
  annual: number;
  features: PlanFeature[];
  featured?: boolean;
};

/** One-time first-subscription bonus for a tier (server grants it in
 *  applySubscription; FIRST_SUB_BONUS is the single source of truth). */
export function bonusTokens(tier: PlanTier["id"]): number {
  return FIRST_SUB_BONUS[tier];
}

/** Total tokens a brand-new subscriber gets in month one: plan grant + bonus. */
export function firstMonthTokens(tier: PlanTier["id"]): number {
  return PLAN_CREDITS[tier] + FIRST_SUB_BONUS[tier];
}

// IMPORTANT: keep this list aligned with what the backend actually enforces
// (see lib/subscription.ts + packages/shared/src/account.ts PLAN_CREDITS).
// Today the only enforced per-plan differentiator is the monthly token grant
// — everything else (modes, export formats, inline editing, embed widget,
// public sharing) is available on every paid plan. Don't list features here
// that aren't actually gated or that don't yet exist.
export const PLAN_TIERS: PlanTier[] = [
  {
    id: "starter",
    category: "lyrics",
    name: "Starter",
    desc: "For trying it out",
    monthly: 6,
    annual: 48,
    features: [
      { text: "All three generation modes" },
      { text: "Every export format" },
      { text: "Inline lyric editing" },
    ],
  },
  {
    id: "creator",
    category: "lyrics",
    name: "Creator",
    desc: "For active releases",
    monthly: 14,
    annual: 120,
    features: [
      { text: "3× the Starter tokens" },
      { text: "Everything in Starter" },
      { text: "API access", comingSoon: true },
    ],
    featured: true,
  },
  {
    id: "pro",
    category: "lyrics",
    name: "Pro",
    desc: "For labels & studios",
    monthly: 29,
    annual: 240,
    features: [
      { text: "4× the Creator tokens" },
      { text: "Everything in Creator" },
      { text: "Early access to new features", comingSoon: true },
    ],
  },
  {
    id: "reel",
    category: "video",
    name: "Reel",
    desc: "For the occasional video",
    monthly: 39,
    annual: 390,
    features: [
      { text: "≈ 11 videos your first month (Lite)" },
      { text: "then ≈ 5 Lite or 2–3 Medium/Pro monthly" },
      { text: "All 3 video styles" },
      { text: "Unlimited lyric files" },
    ],
  },
  {
    id: "studio",
    category: "video",
    name: "Studio",
    desc: "For regular creators",
    monthly: 99,
    annual: 990,
    features: [
      { text: "≈ 20 videos your first month (Lite)" },
      { text: "then ≈ 13 Lite or 5–9 Medium/Pro monthly" },
      { text: "Everything in Reel" },
      { text: "Unlimited lyric files" },
    ],
    featured: true,
  },
  {
    id: "premiere",
    category: "video",
    name: "Premiere",
    desc: "For studios & heavy output",
    monthly: 199,
    annual: 1990,
    features: [
      { text: "≈ 45 videos your first month (Lite)" },
      { text: "then ≈ 38 Lite or 14–25 Medium/Pro monthly" },
      { text: "Best token value (2× rate)" },
      { text: "Everything in Studio" },
    ],
  },
];

/** Lyrics-generation plans (cheap, modest token grants). */
export const LYRICS_TIERS = PLAN_TIERS.filter((t) => t.category === "lyrics");
/** Music-video plans (large token grants for video-heavy users). */
export const VIDEO_TIERS = PLAN_TIERS.filter((t) => t.category === "video");

/** USD price for a plan at a billing period — used as the ad-conversion value.
 *  Prices are fixed (no proration/coupons on a fresh subscription), so this
 *  equals what Stripe charged. Returns null for free / unknown plans. */
export function planPriceUsd(plan: Plan, period: "monthly" | "annual"): number | null {
  const tier = PLAN_TIERS.find((t) => t.id === plan);
  if (!tier) return null;
  return period === "annual" ? tier.annual : tier.monthly;
}
