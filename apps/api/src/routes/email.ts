import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { unsubscribeToken } from "../lib/email.js";

/** One-click unsubscribe from non-transactional email. The token is an HMAC of
 *  the user id, so links can't be forged; no auth required (mail clients open
 *  plain GETs). Idempotent. */
export async function emailRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { u?: string; t?: string } }>("/email/unsubscribe", async (req, reply) => {
    const { u, t } = req.query;
    if (!u || !t || unsubscribeToken(u) !== t) {
      return reply.code(400).send({ error: "Invalid unsubscribe link." });
    }
    await db.update(users).set({ emailOptOut: true, updatedAt: new Date() }).where(eq(users.id, u));
    return reply.send({ ok: true });
  });
}
