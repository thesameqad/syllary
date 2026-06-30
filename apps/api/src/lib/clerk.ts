import { createClerkClient, verifyToken } from "@clerk/backend";
import type { FastifyRequest } from "fastify";
import { env } from "../env.js";

const clerk = env.CLERK_SECRET_KEY
  ? createClerkClient({ secretKey: env.CLERK_SECRET_KEY })
  : null;

const IS_DEV = env.NODE_ENV !== "production";
// localhost + private-LAN origins, optional port — for trusting a real device on
// the same WiFi during development only.
const LAN_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|(?:192\.168|10|172\.(?:1[6-9]|2\d|3[01]))(?:\.\d{1,3}){2})(?::\d+)?$/;

/** Verify the Clerk bearer token and return the Clerk user id, or null if the
 *  request is unauthenticated (or auth isn't configured). */
export async function getAuthUserId(req: FastifyRequest): Promise<string | null> {
  const secretKey = env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  // The token's `azp` claim must match an authorized party. Prod allows only the
  // configured APP_URL; in dev we ALSO trust the requesting localhost/LAN origin so
  // the app can be tested from a real phone (its token's azp is its own LAN origin).
  const authorizedParties = [env.APP_URL];
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  if (IS_DEV && origin && LAN_ORIGIN.test(origin) && !authorizedParties.includes(origin)) {
    authorizedParties.push(origin);
  }
  try {
    const payload = await verifyToken(header.slice(7), { secretKey, authorizedParties });
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
