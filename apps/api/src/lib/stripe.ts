import Stripe from "stripe";
import { eq } from "drizzle-orm";
import type { Plan } from "@syllary/shared";
import { db } from "../db/client.js";
import { users, type UserRow } from "../db/schema.js";
import { env } from "../env.js";

export const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

// quota = monthly song cap; null = unlimited songs (video plans — usage is
// token-gated only).
type PriceInfo = { tier: Plan; quota: number | null; billingPeriod: "monthly" | "annual" };

// Allowed prices + fallback tier/quota. Primary source of quota is the live
// price metadata (CLAUDE.md); this catalog validates checkout requests and is a
// defensive fallback if metadata is ever missing.
export const PRICE_CATALOG: Record<string, PriceInfo> = {};
function register(id: string | undefined, info: PriceInfo) {
  if (id) PRICE_CATALOG[id] = info;
}
register(env.STRIPE_PRICE_STARTER_MONTHLY, { tier: "starter", quota: 30, billingPeriod: "monthly" });
register(env.STRIPE_PRICE_STARTER_YEARLY, { tier: "starter", quota: 30, billingPeriod: "annual" });
register(env.STRIPE_PRICE_CREATOR_MONTHLY, { tier: "creator", quota: 100, billingPeriod: "monthly" });
register(env.STRIPE_PRICE_CREATOR_YEARLY, { tier: "creator", quota: 100, billingPeriod: "annual" });
register(env.STRIPE_PRICE_PRO_MONTHLY, { tier: "pro", quota: 400, billingPeriod: "monthly" });
register(env.STRIPE_PRICE_PRO_YEARLY, { tier: "pro", quota: 400, billingPeriod: "annual" });
// Music-video plans: unlimited songs (quota null), gated only by their large token grant.
register(env.STRIPE_PRICE_REEL_MONTHLY, { tier: "reel", quota: null, billingPeriod: "monthly" });
register(env.STRIPE_PRICE_REEL_YEARLY, { tier: "reel", quota: null, billingPeriod: "annual" });
register(env.STRIPE_PRICE_STUDIO_MONTHLY, { tier: "studio", quota: null, billingPeriod: "monthly" });
register(env.STRIPE_PRICE_STUDIO_YEARLY, { tier: "studio", quota: null, billingPeriod: "annual" });
register(env.STRIPE_PRICE_PREMIERE_MONTHLY, { tier: "premiere", quota: null, billingPeriod: "monthly" });
register(env.STRIPE_PRICE_PREMIERE_YEARLY, { tier: "premiere", quota: null, billingPeriod: "annual" });

export function isAllowedPrice(priceId: string): boolean {
  return priceId in PRICE_CATALOG;
}

/** Resolve {tier, quota} from a Stripe price, preferring its metadata. A null
 *  quota means unlimited songs (the music-video plans). */
export function planFromPrice(price: Stripe.Price): { tier: Plan; quota: number | null } {
  const metaTier = price.metadata?.tier as Plan | undefined;
  const metaQuota = Number(price.metadata?.monthly_song_quota);
  const fallback = PRICE_CATALOG[price.id];
  const tier = metaTier ?? fallback?.tier ?? "starter";
  // Explicit positive metadata wins; else fall back to the catalog (which may be
  // null for video plans); else a safe default for an unknown lyrics price.
  const quota = Number.isFinite(metaQuota) && metaQuota > 0
    ? metaQuota
    : fallback
      ? fallback.quota
      : 30;
  return { tier, quota };
}

export async function getOrCreateCustomer(user: UserRow): Promise<string> {
  if (!stripe) throw new Error("Stripe is not configured");
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    metadata: { clerkUserId: user.clerkUserId, userId: user.id },
  });
  await db
    .update(users)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  return customer.id;
}
