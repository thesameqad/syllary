import type { FastifyInstance } from "fastify";
import {
  type Account,
  type BillingPeriod,
  checkoutRequestSchema,
  type Plan,
} from "@syllary/shared";
import type { UserRow } from "../db/schema.js";
import { env } from "../env.js";
import { getAuthUserId } from "../lib/clerk.js";
import { getOrCreateCustomer, isAllowedPrice, stripe } from "../lib/stripe.js";
import { reconcileCustomer } from "../lib/subscription.js";
import { getOrCreateUser } from "../lib/users.js";

function priceIdFor(tier: "starter" | "creator" | "pro", period: BillingPeriod): string | undefined {
  const map = {
    starter: { monthly: env.STRIPE_PRICE_STARTER_MONTHLY, annual: env.STRIPE_PRICE_STARTER_YEARLY },
    creator: { monthly: env.STRIPE_PRICE_CREATOR_MONTHLY, annual: env.STRIPE_PRICE_CREATOR_YEARLY },
    pro: { monthly: env.STRIPE_PRICE_PRO_MONTHLY, annual: env.STRIPE_PRICE_PRO_YEARLY },
  } as const;
  return map[tier][period];
}

function toAccount(user: UserRow): Account {
  return {
    plan: user.plan as Plan,
    monthlyQuota: user.monthlyQuota,
    songsThisPeriod: user.songsThisPeriod,
    songsLifetime: user.songsLifetime,
    currentPeriodEnd: user.currentPeriodEnd ? user.currentPeriodEnd.toISOString() : null,
    hasSubscription: Boolean(user.stripeSubscriptionId),
  };
}

export async function billingRoutes(app: FastifyInstance) {
  app.get("/me", async (req, reply) => {
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });
    let user = await getOrCreateUser(clerkId);
    // Reconcile from Stripe so plan changes show up even if a webhook is missed.
    if (stripe && user.stripeCustomerId) {
      try {
        await reconcileCustomer(user.stripeCustomerId);
        user = await getOrCreateUser(clerkId);
      } catch (err) {
        req.log.error(err);
      }
    }
    return reply.send(toAccount(user));
  });

  app.post("/billing/checkout", async (req, reply) => {
    if (!stripe) return reply.code(503).send({ error: "Billing is not configured." });
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });

    const parsed = checkoutRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request." });

    const priceId = priceIdFor(parsed.data.tier, parsed.data.billingPeriod);
    if (!priceId || !isAllowedPrice(priceId)) {
      return reply.code(400).send({ error: "Unknown plan." });
    }

    const user = await getOrCreateUser(clerkId);
    const customer = await getOrCreateCustomer(user);

    // Prevent duplicate subscriptions: existing subscribers must use the portal.
    await reconcileCustomer(customer);
    const fresh = await getOrCreateUser(clerkId);
    if (fresh.plan !== "free") {
      return reply
        .code(409)
        .send({ error: "You already have an active plan. Change it from your account." });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${env.APP_URL}/account?checkout=success`,
      cancel_url: `${env.APP_URL}/#pricing`,
      allow_promotion_codes: true,
    });
    if (!session.url) return reply.code(502).send({ error: "Could not start checkout." });
    return reply.send({ url: session.url });
  });

  app.post("/billing/portal", async (req, reply) => {
    if (!stripe) return reply.code(503).send({ error: "Billing is not configured." });
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });

    const user = await getOrCreateUser(clerkId);
    if (!user.stripeCustomerId) {
      return reply.code(400).send({ error: "No billing account yet." });
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${env.APP_URL}/account`,
    });
    return reply.send({ url: session.url });
  });
}
