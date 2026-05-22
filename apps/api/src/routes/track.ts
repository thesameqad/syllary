import type { FastifyInstance } from "fastify";
import { recordVisit } from "../lib/analytics.js";
import { getAuthUserId } from "../lib/clerk.js";
import { ownerHash } from "../lib/hash.js";
import { findUserId } from "../lib/users.js";

export async function trackRoutes(app: FastifyInstance) {
  // Funnel "visited" event. Fire-and-forget from the client on page load; the
  // identity is the IP+UA hash (and userId when signed in). Deduped per day.
  app.post("/track/visit", async (req, reply) => {
    const hash = ownerHash(req.ip, req.headers["user-agent"] ?? "");
    const clerkId = await getAuthUserId(req);
    const userId = clerkId ? await findUserId(clerkId) : null;
    await recordVisit(hash, userId);
    return reply.send({ ok: true });
  });
}
