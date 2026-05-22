import type { Plan } from "@syllary/shared";

export const PLAN_ORDER: Record<Plan, number> = { free: 0, starter: 1, creator: 2, pro: 3 };
export const PLAN_LABEL: Record<Plan, string> = {
  free: "Free",
  starter: "Starter",
  creator: "Creator",
  pro: "Pro",
};

export type PlanTier = {
  id: "starter" | "creator" | "pro";
  name: string;
  desc: string;
  monthly: number;
  annual: number;
  features: string[];
  featured?: boolean;
};

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "starter",
    name: "Starter",
    desc: "For trying it out",
    monthly: 6,
    annual: 48,
    features: ["30 songs/month", "All formats", "Platform validation"],
  },
  {
    id: "creator",
    name: "Creator",
    desc: "For active releases",
    monthly: 14,
    annual: 120,
    features: ["100 songs/month", "Bulk upload", "Priority queue", "Embed widget"],
    featured: true,
  },
  {
    id: "pro",
    name: "Pro",
    desc: "For labels & studios",
    monthly: 29,
    annual: 240,
    features: ["400 songs/month", "API access", "Early MP4 video", "Priority support"],
  },
];
