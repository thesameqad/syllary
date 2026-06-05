import type { FastifyInstance } from "fastify";
import { LANDING_PREFIXES } from "@syllary/shared";
import { firstTouchLandingSlug, recordVisit } from "../lib/analytics.js";
import { getAuthUserId } from "../lib/clerk.js";
import { ownerHash } from "../lib/hash.js";
import { findUserId, stampAcquisition } from "../lib/users.js";

/** Pull a landing slug out of a client-sent path (e.g. "/convert/lrc-to-srt?x=1"
 *  → "convert/lrc-to-srt") when the first segment is a known landing prefix. */
function landingSlugFromPath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  const clean = path.split(/[?#]/)[0]!.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!clean) return null;
  const first = clean.split("/")[0]!;
  return (LANDING_PREFIXES as readonly string[]).includes(first) ? clean : null;
}

export async function trackRoutes(app: FastifyInstance) {
  // Funnel "visited" event. Fire-and-forget from the client on page load; the
  // identity is the IP+UA hash (and userId when signed in). Deduped per day,
  // but a landing arrival is always captured for first-touch attribution.
  app.post<{ Body: { path?: string; referrer?: string } }>("/track/visit", async (req, reply) => {
    const hash = ownerHash(req.ip, req.headers["user-agent"] ?? "");
    const clerkId = await getAuthUserId(req);
    const userId = clerkId ? await findUserId(clerkId) : null;
    const landingSlug = landingSlugFromPath(req.body?.path);
    const referrer = typeof req.body?.referrer === "string" ? req.body.referrer.slice(0, 512) : null;

    await recordVisit(hash, { userId, landingSlug, referrer });

    // First authed visit from a device that arrived via a landing page: stamp
    // the account's acquisition source (once). Cookie-free — reuses the IP+UA
    // hash to bridge the pre-signup anonymous visits to this user.
    if (userId) {
      const firstTouch = await firstTouchLandingSlug(hash);
      if (firstTouch) await stampAcquisition(userId, firstTouch);
    }

    return reply.send({ ok: true });
  });
}
