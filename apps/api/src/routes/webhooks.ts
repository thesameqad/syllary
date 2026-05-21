import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { processedEvents } from "../db/schema.js";
import { env } from "../env.js";
import { stripe } from "../lib/stripe.js";
import { applySubscription, clearSubscription } from "../lib/subscription.js";

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
        case "customer.subscription.created":
        case "customer.subscription.updated":
          await applySubscription(event.data.object);
          break;
        case "customer.subscription.deleted":
          await clearSubscription(event.data.object);
          break;
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
