import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, type UserRow } from "../db/schema.js";
import { getClerkProfile } from "./clerk.js";
import { recordEvent } from "./analytics.js";

/** Resolve our user id from a Clerk id without creating a row. */
export async function findUserId(clerkUserId: string): Promise<string | null> {
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  return u?.id ?? null;
}

/** Look up our user row for a Clerk user, creating it on first sight. */
export async function getOrCreateUser(clerkUserId: string): Promise<UserRow> {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  if (existing) return existing;

  const { email, displayName } = await getClerkProfile(clerkUserId);
  const [created] = await db
    .insert(users)
    .values({ clerkUserId, email, displayName })
    .onConflictDoNothing()
    .returning();
  if (created) {
    // Funnel: first time we see this account = sign-up.
    await recordEvent("signed_up", { ownerHash: `clerk:${clerkUserId}`, userId: created.id });
    return created;
  }

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  return row!;
}
