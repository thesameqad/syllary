import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, type UserRow } from "../db/schema.js";
import { getClerkEmail } from "./clerk.js";

/** Look up our user row for a Clerk user, creating it on first sight. */
export async function getOrCreateUser(clerkUserId: string): Promise<UserRow> {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  if (existing) return existing;

  const email = await getClerkEmail(clerkUserId);
  const [created] = await db
    .insert(users)
    .values({ clerkUserId, email })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  return row!;
}
