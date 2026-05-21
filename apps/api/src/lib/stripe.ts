import Stripe from "stripe";
import { eq } from "drizzle-orm";
import type { Plan } from "@syllary/shared";
import { db } from "../db/client.js";
import { users, type UserRow } from "../db/schema.js";
import { env } from "../env.js";

export const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

type PriceInfo = { tier: Plan; quota: number; billingPeriod: "monthly" | "annual" };

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

export function isAllowedPrice(priceId: string): boolean {
  return priceId in PRICE_CATALOG;
}

/** Resolve {tier, quota} from a Stripe price, preferring its metadata. */
export function planFromPrice(price: Stripe.Price): { tier: Plan; quota: number } {
  const metaTier = price.metadata?.tier as Plan | undefined;
  const metaQuota = Number(price.metadata?.monthly_song_quota);
  const fallback = PRICE_CATALOG[price.id];
  return {
    tier: metaTier ?? fallback?.tier ?? "starter",
    quota: Number.isFinite(metaQuota) && metaQuota > 0 ? metaQuota : (fallback?.quota ?? 30),
  };
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
