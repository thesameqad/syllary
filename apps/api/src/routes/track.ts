import type { FastifyInstance } from "fastify";
import { LANDING_PREFIXES } from "@syllary/shared";
import {
  clickAttributionFromPath,
  firstTouchClick,
  firstTouchLandingSlug,
  recordVisit,
} from "../lib/analytics.js";
import { getAuthUserId } from "../lib/clerk.js";
import { ownerHash } from "../lib/hash.js";
import { aliasServer } from "../lib/posthog.js";
import { findUserId, stampAcquisition, stampClickAttribution } from "../lib/users.js";

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
    // Ad click ids (gclid/msclkid) + UTMs ride the query string of the landing
    // URL; the client sends path + query so we can persist them here.
    const { click, utm } = clickAttributionFromPath(req.body?.path);

    await recordVisit(hash, { userId, landingSlug, referrer, click, utm });

    // First authed visit from a device that arrived via a landing page or an ad
    // click: stamp the account's acquisition source (once). Cookie-free —
    // reuses the IP+UA hash to bridge pre-signup anonymous visits to this user.
    if (userId) {
      const firstTouch = await firstTouchLandingSlug(hash);
      if (firstTouch) await stampAcquisition(userId, firstTouch);
      const clickTouch = click ?? (await firstTouchClick(hash));
      if (clickTouch) await stampClickAttribution(userId, clickTouch);
      // Merge this device's anonymous server-side events into the signed-in
      // PostHog person (mirrors posthog.identify() on the client).
      aliasServer(`clerk:${clerkId}`, hash);
    }

    return reply.send({ ok: true });
  });
}
