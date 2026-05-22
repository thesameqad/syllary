import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { processedEvents, users } from "../db/schema.js";
import { env } from "../env.js";
import { recordEvent } from "../lib/analytics.js";
import { stripe } from "../lib/stripe.js";
import { applySubscription, clearSubscription } from "../lib/subscription.js";

/** Record a billing funnel event ('subscribed' | 'renewed'), resolving the user
 *  by Stripe customer id. Best-effort. */
async function recordBilling(
  stage: "subscribed" | "renewed",
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
  props: Record<string, unknown>,
): Promise<void> {
  const customerId = typeof customer === "string" ? customer : customer?.id;
  if (!customerId) return;
  const [user] = await db
    .select({ id: users.id, clerkUserId: users.clerkUserId })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);
  if (!user) return;
  await recordEvent(stage, { ownerHash: `clerk:${user.clerkUserId}`, userId: user.id, props });
}

export async function webhookRoutes(app: FastifyInstance) {
  app.post("/webhooks/stripe", async (req, reply) => {
    if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
      return reply.code(503).send({ error: "Billing is not configured." });
    }
    const sig = req.headers["stripe-signature"];
    if (!sig || !req.rawBody) return reply.code(400).send({ error: "Missing signature." });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        Array.isArray(sig) ? sig[0]! : sig,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      req.log.error(err);
      return reply.code(400).send({ error: "Invalid signature." });
    }

    // Idempotency (rule #1): skip if we've already handled this event.
    const [seen] = await db
      .select()
      .from(processedEvents)
      .where(eq(processedEvents.id, event.id))
      .limit(1);
    if (seen) return reply.send({ received: true, duplicate: true });

    try {
      switch (event.type) {
        case "customer.subscription.created": {
          const sub = event.data.object;
          await applySubscription(sub);
          await recordBilling("subscribed", sub.customer, {
            subscriptionId: sub.id,
            priceId: sub.items.data[0]?.price.id ?? null,
            status: sub.status,
          });
          break;
        }
        case "customer.subscription.updated":
          await applySubscription(event.data.object);
          break;
        case "customer.subscription.deleted":
          await clearSubscription(event.data.object);
          break;
        case "invoice.payment_succeeded": {
          // A recurring-cycle invoice = a renewal (first payment is
          // 'subscription_create', handled by subscription.created above).
          const invoice = event.data.object;
          if (invoice.billing_reason === "subscription_cycle") {
            await recordBilling("renewed", invoice.customer, {
              invoiceId: invoice.id,
              amountPaid: invoice.amount_paid,
              currency: invoice.currency,
            });
          }
          break;
        }
        default:
          break;
      }
    } catch (err) {
      req.log.error(err);
      // Return 500 so Stripe retries; we haven't marked it processed yet.
      return reply.code(500).send({ error: "Handler failed." });
    }

    await db.insert(processedEvents).values({ id: event.id }).onConflictDoNothing();
    return reply.send({ received: true });
  });
}
