import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { PLAN_CREDITS } from "@syllary/shared";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { planFromPrice, stripe } from "./stripe.js";

function customerIdOf(sub: Stripe.Subscription): string {
  return typeof sub.customer === "string" ? sub.customer : sub.customer.id;
}

/** Update our user row from a Stripe subscription (sets free if inactive). */
export async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.stripeCustomerId, customerIdOf(sub)))
    .limit(1);
  if (!user) return;

  const item = sub.items.data[0];
  const { tier, quota } = item ? planFromPrice(item.price) : { tier: "free" as const, quota: 0 };
  const active = sub.status === "active" || sub.status === "trialing";
  const periodEndUnix = item?.current_period_end ?? null;
  const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;
  const periodChanged =
    !user.currentPeriodEnd || (periodEnd ? periodEnd.getTime() !== user.currentPeriodEnd.getTime() : false);
  // Grant the plan's token allowance on activation, upgrade, or renewal —
  // not on every reconcile (so usage within a period is preserved).
  const grantTokens = active && (periodChanged || user.plan !== tier);

  await db
    .update(users)
    .set({
      plan: active ? tier : "free",
      planStatus: sub.status,
      stripeSubscriptionId: active ? sub.id : null,
      monthlyQuota: active ? quota : null,
      currentPeriodEnd: active ? periodEnd : null,
      songsThisPeriod: periodChanged ? 0 : user.songsThisPeriod,
      ...(grantTokens ? { credits: PLAN_CREDITS[tier] } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
}

export async function clearSubscription(sub: Stripe.Subscription): Promise<void> {
  await db
    .update(users)
    .set({
      plan: "free",
      planStatus: "canceled",
      stripeSubscriptionId: null,
      monthlyQuota: null,
      currentPeriodEnd: null,
      updatedAt: new Date(),
    })
    .where(eq(users.stripeCustomerId, customerIdOf(sub)));
}

/** Pull the customer's current subscription from Stripe and apply it. Used as a
 *  fallback so plan changes show up even if a webhook is missed/not delivered. */
export async function reconcileCustomer(customerId: string): Promise<void> {
  if (!stripe) return;
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
  const target =
    subs.data.find((s) => s.status === "active" || s.status === "trialing") ?? subs.data[0];
  if (target) await applySubscription(target);
}
