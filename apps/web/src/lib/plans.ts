import type { Plan } from "@syllary/shared";

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
      { text: "5,000 tokens / month" },
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
      { text: "15,000 tokens / month — 3× Starter" },
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
      { text: "60,000 tokens / month — 4× Creator" },
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
      { text: "80,000 tokens / month" },
      { text: "≈ 2–3 music videos" },
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
      { text: "220,000 tokens / month" },
      { text: "≈ 5–9 music videos" },
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
      { text: "620,000 tokens / month" },
      { text: "≈ 20–36 music videos" },
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
