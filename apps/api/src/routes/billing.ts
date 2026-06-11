import type { FastifyInstance } from "fastify";
import {
  type Account,
  type BillingPeriod,
  type CheckoutRequest,
  checkoutRequestSchema,
  type Plan,
} from "@syllary/shared";
import type { UserRow } from "../db/schema.js";
import { env } from "../env.js";
import { isAdminClerkId } from "../lib/admin.js";
import { getAuthUserId } from "../lib/clerk.js";
import { captureServer } from "../lib/posthog.js";
import { getOrCreateCustomer, isAllowedPrice, stripe } from "../lib/stripe.js";
import { reconcileCustomer } from "../lib/subscription.js";
import { getOrCreateUser } from "../lib/users.js";

function priceIdFor(tier: CheckoutRequest["tier"], period: BillingPeriod): string | undefined {
  const map = {
    starter: { monthly: env.STRIPE_PRICE_STARTER_MONTHLY, annual: env.STRIPE_PRICE_STARTER_YEARLY },
    creator: { monthly: env.STRIPE_PRICE_CREATOR_MONTHLY, annual: env.STRIPE_PRICE_CREATOR_YEARLY },
    pro: { monthly: env.STRIPE_PRICE_PRO_MONTHLY, annual: env.STRIPE_PRICE_PRO_YEARLY },
    reel: { monthly: env.STRIPE_PRICE_REEL_MONTHLY, annual: env.STRIPE_PRICE_REEL_YEARLY },
    studio: { monthly: env.STRIPE_PRICE_STUDIO_MONTHLY, annual: env.STRIPE_PRICE_STUDIO_YEARLY },
    premiere: { monthly: env.STRIPE_PRICE_PREMIERE_MONTHLY, annual: env.STRIPE_PRICE_PREMIERE_YEARLY },
  } as const;
  return map[tier][period];
}

function toAccount(user: UserRow, isAdmin: boolean): Account {
  return {
    plan: user.plan as Plan,
    credits: user.credits,
    monthlyQuota: user.monthlyQuota,
    songsThisPeriod: user.songsThisPeriod,
    songsLifetime: user.songsLifetime,
    currentPeriodEnd: user.currentPeriodEnd ? user.currentPeriodEnd.toISOString() : null,
    hasSubscription: Boolean(user.stripeSubscriptionId),
    isAdmin,
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
    return reply.send(toAccount(user, isAdminClerkId(clerkId)));
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
    captureServer(`clerk:${clerkId}`, "checkout_started", {
      plan: parsed.data.tier,
      interval: parsed.data.billingPeriod,
    });
    return reply.send({ url: session.url });
  });

  // Switch an existing subscriber to a different plan. Deep-links straight to a
  // Stripe portal confirm screen for the chosen price (shows proration, applies
  // the change) instead of dumping the user on the generic "manage" page.
  // Requires the customer portal to have plan switching enabled in the Stripe
  // dashboard (Settings → Billing → Customer portal → "Customers can switch
  // plans", with the products added).
  app.post("/billing/change-plan", async (req, reply) => {
    if (!stripe) return reply.code(503).send({ error: "Billing is not configured." });
    const clerkId = await getAuthUserId(req);
    if (!clerkId) return reply.code(401).send({ error: "Unauthorized" });

    const parsed = checkoutRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ body: req.body, issues: parsed.error.issues }, "change-plan: invalid body");
      return reply.code(400).send({ error: "Invalid request." });
    }

    const priceId = priceIdFor(parsed.data.tier, parsed.data.billingPeriod);
    if (!priceId || !isAllowedPrice(priceId)) {
      req.log.warn(
        { tier: parsed.data.tier, billingPeriod: parsed.data.billingPeriod, priceId },
        "change-plan: no configured Stripe price for this plan (env var missing?)",
      );
      return reply.code(400).send({ error: "That plan isn't available yet — its price isn't configured." });
    }

    const user = await getOrCreateUser(clerkId);
    if (!user.stripeCustomerId || !user.stripeSubscriptionId) {
      req.log.warn(
        { customer: user.stripeCustomerId, subscription: user.stripeSubscriptionId },
        "change-plan: user has no active subscription on record",
      );
      return reply.code(400).send({ error: "No active subscription to change. Try subscribing first." });
    }

    // The update flow needs the subscription's line-item id.
    const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) {
      req.log.warn({ subscription: user.stripeSubscriptionId }, "change-plan: subscription has no items");
      return reply.code(400).send({ error: "Could not read your subscription." });
    }

    let session;
    try {
      session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${env.APP_URL}/account?checkout=success`,
        flow_data: {
          type: "subscription_update_confirm",
          subscription_update_confirm: {
            subscription: user.stripeSubscriptionId,
            items: [{ id: itemId, price: priceId }],
          },
        },
      });
    } catch (err) {
      // Most common cause: the Customer Portal config doesn't have plan
      // switching enabled (Stripe → Settings → Billing → Customer portal →
      // "Customers can switch plans"). Surface a clear message, not a raw error.
      req.log.error({ err }, "change-plan: Stripe rejected the portal update flow");
      return reply.code(502).send({
        error:
          "Plan switching isn't enabled in Stripe yet. Enable 'Customers can switch plans' in the Stripe customer portal settings.",
      });
    }
    if (!session.url) return reply.code(502).send({ error: "Could not start the plan change." });
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
