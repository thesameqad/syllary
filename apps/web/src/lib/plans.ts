import type { Plan } from "@syllary/shared";

export const PLAN_ORDER: Record<Plan, number> = { free: 0, starter: 1, creator: 2, pro: 3 };
export const PLAN_LABEL: Record<Plan, string> = {
  free: "Free",
  starter: "Starter",
  creator: "Creator",
  pro: "Pro",
};

export type PlanFeature = { text: string; comingSoon?: boolean };

export type PlanTier = {
  id: "starter" | "creator" | "pro";
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
    name: "Creator",
    desc: "For active releases",
    monthly: 14,
    annual: 120,
    features: [
      { text: "15,000 tokens / month — 3× Starter" },
      { text: "Everything in Starter" },
      { text: "API access", comingSoon: true },
      { text: "Cancel or upgrade anytime" },
    ],
    featured: true,
  },
  {
    id: "pro",
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
];
