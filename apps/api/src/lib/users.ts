import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, type UserRow } from "../db/schema.js";
import { getClerkProfile } from "./clerk.js";
import { type ClickAttribution, recordEvent } from "./analytics.js";
import { sendOnce, welcomeEmail } from "./email.js";
import { captureServer, identifyServer } from "./posthog.js";

/** Stamp the account's first-touch acquisition landing slug, once. No-op if it
 *  was already set (so the earliest source wins). Best-effort: never throws. */
export async function stampAcquisition(userId: string, slug: string): Promise<void> {
  try {
    await db
      .update(users)
      .set({ acquisitionLandingSlug: slug, acquisitionAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.acquisitionLandingSlug)));
  } catch {
    // attribution is best-effort
  }
}

/** Stamp the account's first-touch ad click (gclid/msclkid) + UTMs, once. The
 *  Stripe webhook reads these to export purchase conversions back to the ad
 *  platforms. Best-effort: never throws. */
export async function stampClickAttribution(userId: string, click: ClickAttribution): Promise<void> {
  try {
    await db
      .update(users)
      .set({
        acquisitionClickId: click.clickId,
        acquisitionClickSource: click.source,
        ...(click.utm ? { acquisitionUtm: click.utm } : {}),
      })
      .where(and(eq(users.id, userId), isNull(users.acquisitionClickId)));
  } catch {
    // attribution is best-effort
  }
}

/** Resolve our user id from a Clerk id without creating a row. */
export async function findUserId(clerkUserId: string): Promise<string | null> {
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  return u?.id ?? null;
}

/** Clerk users whose email we've already pushed to PostHog this process, so the
 *  server-side identify runs at most once per user per instance instead of on
 *  every authenticated request. */
const personEmailPushed = new Set<string>();

/** Attach a logged-in person's verified email (+ name) to PostHog, once per
 *  process. Server-side is authoritative: it always has the email and isn't
 *  blocked by ad blockers, so even returning logins (which never re-run the
 *  client signup path) and ad-blocked browsers still get an email on the person. */
function ensurePersonEmail(
  clerkUserId: string,
  email: string | null,
  displayName: string | null,
): void {
  if (!email || personEmailPushed.has(clerkUserId)) return;
  personEmailPushed.add(clerkUserId);
  identifyServer(`clerk:${clerkUserId}`, {
    email,
    ...(displayName ? { name: displayName } : {}),
  });
}

/** Look up our user row for a Clerk user, creating it on first sight. */
export async function getOrCreateUser(clerkUserId: string): Promise<UserRow> {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  if (existing) {
    ensurePersonEmail(clerkUserId, existing.email, existing.displayName);
    return existing;
  }

  const { email, displayName } = await getClerkProfile(clerkUserId);
  const [created] = await db
    .insert(users)
    .values({ clerkUserId, email, displayName })
    .onConflictDoNothing()
    .returning();
  if (created) {
    // Funnel: first time we see this account = sign-up. $set stamps the email on
    // the PostHog person immediately (and marks it pushed for this process).
    await recordEvent("signed_up", { ownerHash: `clerk:${clerkUserId}`, userId: created.id });
    captureServer(`clerk:${clerkUserId}`, "signup_completed", {
      $set: {
        ...(email ? { email } : {}),
        ...(displayName ? { name: displayName } : {}),
      },
    });
    if (email) personEmailPushed.add(clerkUserId);
    void sendOnce(created, "welcome", welcomeEmail);
    return created;
  }

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  ensurePersonEmail(clerkUserId, row!.email, row!.displayName);
  return row!;
}
