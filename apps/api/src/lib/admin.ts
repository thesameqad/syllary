import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env.js";
import { getAuthUserId } from "./clerk.js";

const ADMIN_IDS = new Set(
  env.ADMIN_CLERK_IDS.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/** True when the Clerk id is in the configured admin allowlist. */
export function isAdminClerkId(clerkId: string | null | undefined): boolean {
  return clerkId != null && ADMIN_IDS.has(clerkId);
}

/** Route guard: resolve the caller's Clerk id and 403 unless they're an admin.
 *  Returns the Clerk id on success, or null after sending the error response
 *  (callers should `return` immediately when null). */
export async function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<string | null> {
  const clerkId = await getAuthUserId(req);
  if (!isAdminClerkId(clerkId)) {
    reply.code(403).send({ error: "Forbidden." });
    return null;
  }
  return clerkId;
}
