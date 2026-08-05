import { and, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { analyticsEvents, songs, users, videoJobs } from "../db/schema.js";
import { env } from "../env.js";
import {
  buildCheckoutRecoveryAutoEmail,
  buildDripUpgrade,
  buildDripVideo,
  buildWinback,
  sendOnce,
} from "./email.js";
import { captureForUserId } from "./posthog.js";

/** The onboarding drip, run as a cheap in-process poller (same pattern as the
 *  video pipeline's stale-job sweep — no queue infra). sendOnce()'s unique
 *  (userId, kind) claim makes double-sends impossible even across restarts.
 *
 *  Day 0 is the welcome email (sent inline at signup, lib/users.ts).
 *  Day 2 — "make a lyric video" nudge, only if they have no video job yet.
 *  Day 5 — upgrade nudge, only if they're still on the free plan.
 *  Both are marketing emails: they respect emailOptOut + carry unsubscribe. */

const DAY_MS = 24 * 60 * 60 * 1000;
const POLL_MS = 30 * 60 * 1000;

async function dripVideoNudge(): Promise<void> {
  // Signed up 2–7 days ago (the upper bound stops ancient accounts getting a
  // "day 2" email if the poller was ever down for a long stretch).
  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        lt(users.createdAt, new Date(Date.now() - 2 * DAY_MS)),
        gte(users.createdAt, new Date(Date.now() - 7 * DAY_MS)),
        eq(users.emailOptOut, false),
        isNotNull(users.email),
      ),
    )
    .limit(200);

  for (const user of rows) {
    const [job] = await db
      .select({ id: videoJobs.id })
      .from(videoJobs)
      .where(eq(videoJobs.userId, user.id))
      .limit(1);
    if (job) continue; // already discovered videos on their own

    // Their most recent finished song makes the email concrete.
    const [song] = await db
      .select({ id: songs.id, title: songs.title })
      .from(songs)
      .where(and(eq(songs.userId, user.id), eq(songs.status, "ready")))
      .orderBy(desc(songs.createdAt))
      .limit(1);

    await sendOnce(user, "drip_video_day2", () => buildDripVideo(user.id, song?.id ?? null, song?.title ?? null), {
      marketing: true,
    });
  }
}

async function dripUpgradeNudge(): Promise<void> {
  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        lt(users.createdAt, new Date(Date.now() - 5 * DAY_MS)),
        gte(users.createdAt, new Date(Date.now() - 10 * DAY_MS)),
        eq(users.plan, "free"),
        eq(users.emailOptOut, false),
        isNotNull(users.email),
        // Only nudge people who actually used the product (≥1 song processed).
        sql`${users.songsLifetime} >= 1`,
      ),
    )
    .limit(200);

  for (const user of rows) {
    await sendOnce(user, "drip_upgrade_day5", () => buildDripUpgrade(user.id), { marketing: true });
  }
}

/** Win-back: real users (≥1 song) whose latest activity is 30–60 days old.
 *  Applies to free AND paid accounts — an inactive subscriber is pre-churn.
 *  Sent once ever per user (email_log kind), marketing rules apply. */
async function winbackNudge(): Promise<void> {
  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.emailOptOut, false),
        isNotNull(users.email),
        sql`${users.songsLifetime} >= 1`,
      ),
    )
    .limit(500);

  const now = Date.now();
  for (const user of rows) {
    const [latest] = await db
      .select({ id: songs.id, title: songs.title, createdAt: songs.createdAt })
      .from(songs)
      .where(eq(songs.userId, user.id))
      .orderBy(desc(songs.createdAt))
      .limit(1);
    if (!latest) continue;
    const age = now - latest.createdAt.getTime();
    if (age < 30 * DAY_MS || age > 60 * DAY_MS) continue;

    const [count] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(songs)
      .where(eq(songs.userId, user.id));

    await sendOnce(user, "winback_30d", () => buildWinback(user.id, latest.title, count?.n ?? 1), {
      marketing: true,
    });
  }
}

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  creator: "Creator",
  pro: "Pro",
  reel: "Reel",
  studio: "Studio",
  premiere: "Premiere",
};

/** Card-abandon follow-up: someone started a Stripe checkout ≥45 minutes ago
 *  and still has no subscription. Payers complete within minutes (every payer
 *  to date activated 0–23 min after checkout_started), so 45 min = decisively
 *  abandoned while the intent is still same-day warm. Once ever per user; the
 *  48h lower bound keeps ancient attempts from resurfacing after downtime. */
async function checkoutRecoveryNudge(): Promise<void> {
  const rows = await db
    .select({ userId: analyticsEvents.userId, props: analyticsEvents.props })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.stage, "checkout_started"),
        lt(analyticsEvents.createdAt, new Date(Date.now() - 45 * 60 * 1000)),
        gte(analyticsEvents.createdAt, new Date(Date.now() - 48 * 60 * 60 * 1000)),
        isNotNull(analyticsEvents.userId),
      ),
    )
    .limit(200);

  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.userId || seen.has(row.userId)) continue;
    seen.add(row.userId);

    const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    if (!user?.email || user.emailOptOut) continue;
    // They finished after all (or got upgraded some other way) — no email.
    if (user.stripeSubscriptionId || user.plan !== "free") continue;

    const [song] = await db
      .select({ id: songs.id })
      .from(songs)
      .where(and(eq(songs.userId, user.id), eq(songs.status, "ready")))
      .orderBy(desc(songs.createdAt))
      .limit(1);

    const tier = (row.props as Record<string, unknown> | null)?.tier;
    const planName = typeof tier === "string" ? (PLAN_LABELS[tier] ?? null) : null;
    const first = user.displayName?.trim().split(/\s+/)[0] || null;
    const ctaUrl = song ? `${env.APP_URL}/s/${song.id}` : env.APP_URL;

    const sent = await sendOnce(
      user,
      "checkout_recovery",
      () => buildCheckoutRecoveryAutoEmail({ userId: user.id, firstName: first, planName, ctaUrl }),
      { marketing: true },
    );
    if (sent) {
      // Funnel: checkout_started → checkout_recovery_sent → subscription_activated.
      await captureForUserId(user.id, "checkout_recovery_sent", { plan: tier ?? null });
    }
  }
}

export function startEmailDrip(): void {
  if (!env.RESEND_API_KEY) return; // nothing to do without a sender
  const tick = async () => {
    try {
      await dripVideoNudge();
      await dripUpgradeNudge();
      await winbackNudge();
      await checkoutRecoveryNudge();
    } catch {
      // next tick retries; sendOnce guarantees no duplicates
    }
  };
  // First pass shortly after boot, then every 30 minutes.
  setTimeout(() => void tick(), 60 * 1000);
  setInterval(() => void tick(), POLL_MS);
}
