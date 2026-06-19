import { eq, sql } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/client.js";
import { users, type UserRow } from "../db/schema.js";
import { getAuthUserId } from "./clerk.js";
import { getOrCreateUser } from "./users.js";

/**
 * Run a token-costing tool call with sign-in + credit gating, then deduct
 * credits — but only after the work succeeds. Returns null if the caller was
 * rejected (the 401/402 response is already sent); the route should `return`.
 * If `run()` throws, credits are NOT charged and the error propagates to the
 * route's catch.
 */
export async function runMeteredTool<T>(
  req: FastifyRequest,
  reply: FastifyReply,
  opts: { cost: number; run: () => Promise<T> },
): Promise<{ user: UserRow; result: T } | null> {
  const clerkId = await getAuthUserId(req);
  if (!clerkId) {
    reply.code(401).send({ error: "Sign in to use this tool." });
    return null;
  }
  const user = await getOrCreateUser(clerkId);
  if (user.credits < opts.cost) {
    reply.code(402).send({
      error: `Not enough tokens — this costs ${opts.cost}. Upgrade for more.`,
    });
    return null;
  }

  const result = await opts.run();

  await db
    .update(users)
    .set({ credits: sql`GREATEST(${users.credits} - ${opts.cost}, 0)`, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return { user, result };
}

// Lightweight in-memory rate limiter for the free, no-token tools (e.g. the
// streaming-link finder) — a soft abuse guard keyed by the anonymous owner hash.
// Per-process only; that's sufficient for a light external-API guard.
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Returns true if the call is allowed; false when the per-window cap is hit. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

// One free demo render per owner hash. Kept separate from rateLimit so a *failed*
// render doesn't burn the visitor's single free try: rateLimit counts every
// attempt, whereas this is consumed only on success (markDemoRenderUsed). The map
// is in-memory and per-process — it resets on deploy and isn't shared across
// instances, which is fine for a conversion nudge (it is NOT a security control).
const demoUsed = new Map<string, number>();

/** True if this owner-hash key has already used its free demo render this window. */
export function demoRenderUsed(key: string): boolean {
  const expiresAt = demoUsed.get(key);
  if (expiresAt === undefined) return false;
  if (Date.now() >= expiresAt) {
    demoUsed.delete(key);
    return false;
  }
  return true;
}

/** Mark a free demo render as used. Call only after a successful render. Default
 *  window is one day, matching the anonymous "one free try" tier. */
export function markDemoRenderUsed(key: string, windowMs = 24 * 60 * 60 * 1000): void {
  demoUsed.set(key, Date.now() + windowMs);
}
