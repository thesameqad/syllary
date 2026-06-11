import { PostHog } from "posthog-node";
import { env } from "../env.js";

/** Server-side PostHog client, or null when no key is configured (local dev,
 *  preview deploys). Server events are AUTHORITATIVE for anything touching
 *  money or the pipeline; the web app captures view/intent moments only, and
 *  the two sides never share an event name. The Postgres funnel
 *  (analytics_events) stays the source of truth for revenue math — PostHog
 *  adds behavioral funnels, session-replay context, and retention views. */
const client = env.POSTHOG_API_KEY
  ? new PostHog(env.POSTHOG_API_KEY, {
      host: env.POSTHOG_HOST,
      // Small batches, quick flush: Render instances can restart on deploy and
      // we'd rather not lose the tail of the queue.
      flushAt: 10,
      flushInterval: 5_000,
    })
  : null;

/** Identity scheme matches lib/analytics.ts: `clerk:{clerkUserId}` for signed-in
 *  users, the IP+UA ownerHash for anonymous — so PostHog persons line up with
 *  the Postgres funnel identities. */
export function captureServer(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): void {
  try {
    client?.capture({ distinctId, event, properties });
  } catch {
    // analytics must never break a request
  }
}

/** Merge an anonymous device identity into the signed-in person (call once a
 *  request carries both). Mirrors the client-side posthog.identify(). */
export function aliasServer(distinctId: string, aliasId: string): void {
  try {
    client?.alias({ distinctId, alias: aliasId });
  } catch {
    // ignore
  }
}

/** Capture for an internal user id (uuid) — resolves the clerk identity so the
 *  event lands on the same PostHog person as the rest of the funnel. For code
 *  paths (like the video pipeline) that don't have the request's auth context. */
export async function captureForUserId(
  userId: string | null,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  if (!client || !userId) return;
  try {
    const { db } = await import("../db/client.js");
    const { users } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const [u] = await db
      .select({ clerkUserId: users.clerkUserId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    captureServer(u ? `clerk:${u.clerkUserId}` : `user:${userId}`, event, properties);
  } catch {
    // ignore
  }
}

export async function shutdownPosthog(): Promise<void> {
  try {
    await client?.shutdown();
  } catch {
    // ignore
  }
}
