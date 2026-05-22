import { createClerkClient, verifyToken } from "@clerk/backend";
import type { FastifyRequest } from "fastify";
import { env } from "../env.js";

const clerk = env.CLERK_SECRET_KEY
  ? createClerkClient({ secretKey: env.CLERK_SECRET_KEY })
  : null;

/** Verify the Clerk bearer token and return the Clerk user id, or null if the
 *  request is unauthenticated (or auth isn't configured). */
export async function getAuthUserId(req: FastifyRequest): Promise<string | null> {
  const secretKey = env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const payload = await verifyToken(header.slice(7), {
      secretKey,
      authorizedParties: [env.APP_URL],
    });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function getClerkEmail(userId: string): Promise<string | null> {
  if (!clerk) return null;
  try {
    const user = await clerk.users.getUser(userId);
    return (
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null
    );
  } catch {
    return null;
  }
}

/** Email + a public display name (username, then full name, then email local
 *  part) for a Clerk user. Used to label uploaders on public pages. */
export async function getClerkProfile(
  userId: string,
): Promise<{ email: string | null; displayName: string | null }> {
  if (!clerk) return { email: null, displayName: null };
  try {
    const user = await clerk.users.getUser(userId);
    const email =
      user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    const displayName =
      user.username?.trim() || (fullName.length > 0 ? fullName : null) || email?.split("@")[0] || null;
    return { email, displayName };
  } catch {
    return { email: null, displayName: null };
  }
}
