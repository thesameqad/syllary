import "../load-env.js";
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { emailLog, songs, users } from "../db/schema.js";
import { env } from "../env.js";
import { buildOutageApologyEmail, sendOnce } from "../lib/email.js";

// Apology + make-good for the Jul 12-13 2026 processing outage (Replicate
// credit ran out at 2026-07-12 00:52 UTC; every Demucs kickoff 402'd until
// ~2026-07-13 21:05 UTC). Recipients: signed-in users with a failed song in
// the window. Each gets +10,000 credits (once) and the apology email (once).
//
// Idempotent by design — safe to re-run after a partial failure:
//   email_log 'outage_credit_jul13'  = the credit grant marker (claimed BEFORE
//                                      the UPDATE, so credits can never double)
//   email_log 'outage_apology_jul13' = the email itself (via sendOnce)
//
//   APP_URL=https://syllary.com pnpm --filter @syllary/api exec \
//     tsx src/scripts/send-outage-apology.ts [--dry-run | --test]
const WINDOW_START = "2026-07-12 00:50:00+00";
const WINDOW_END = "2026-07-13 21:10:00+00";
const CREDIT_KIND = "outage_credit_jul13";
const EMAIL_KIND = "outage_apology_jul13";
const MAKE_GOOD_CREDITS = 10_000;
const TEST_TO = "thesameqad@gmail.com";

function firstNameOf(name: string | null): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : null;
}

async function main(): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not set — cannot send.");
  if (!env.APP_URL.startsWith("https://")) {
    throw new Error(
      `APP_URL is "${env.APP_URL}" — refusing to send non-production links. Re-run with APP_URL=https://syllary.com.`,
    );
  }

  // Distinct signed-in owners of songs that failed inside the outage window.
  const affected = await db
    .selectDistinct({ userId: songs.userId })
    .from(songs)
    .where(
      and(
        eq(songs.status, "failed"),
        eq(songs.error, "Could not start processing."),
        gte(songs.createdAt, new Date(WINDOW_START)),
        lte(songs.createdAt, new Date(WINDOW_END)),
        isNotNull(songs.userId),
      ),
    );
  const ids = affected.map((r) => r.userId).filter((id): id is string => id != null);
  const recipients = ids.length
    ? await db
        .select({
          id: users.id,
          email: users.email,
          name: users.displayName,
          emailOptOut: users.emailOptOut,
          credits: users.credits,
        })
        .from(users)
        .where(inArray(users.id, ids))
    : [];
  const reachable = recipients.filter((r) => r.email);
  console.log(`Affected signed-in users: ${recipients.length} (${reachable.length} with an email)`);

  if (process.argv.includes("--dry-run")) {
    for (const r of reachable) console.log(`  would grant +${MAKE_GOOD_CREDITS} & email: ${r.email}`);
    process.exit(0);
  }

  if (process.argv.includes("--test")) {
    const { subject, html } = buildOutageApologyEmail({ firstName: "Anton", ctaUrl: env.APP_URL });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [TEST_TO], subject, html }),
    });
    console.log(`TEST copy → ${TEST_TO}: ${res.status} ${res.ok ? "OK ✅" : "FAILED ❌"}`);
    process.exit(res.ok ? 0 : 1);
  }

  let granted = 0;
  let sent = 0;
  for (const r of reachable) {
    // Claim the credit marker first — the unique (user, kind) row is the lock,
    // so a re-run can never grant twice even if the email part failed before.
    const [claim] = await db
      .insert(emailLog)
      .values({ userId: r.id, kind: CREDIT_KIND })
      .onConflictDoNothing()
      .returning();
    if (claim) {
      await db
        .update(users)
        .set({ credits: sql`${users.credits} + ${MAKE_GOOD_CREDITS}`, updatedAt: new Date() })
        .where(eq(users.id, r.id));
      granted++;
    }

    await sendOnce({ id: r.id, email: r.email, emailOptOut: r.emailOptOut }, EMAIL_KIND, () =>
      buildOutageApologyEmail({ firstName: firstNameOf(r.name), ctaUrl: env.APP_URL }),
    );
    const [delivered] = await db
      .select({ sentAt: emailLog.sentAt })
      .from(emailLog)
      .where(and(eq(emailLog.userId, r.id), eq(emailLog.kind, EMAIL_KIND)))
      .limit(1);
    if (delivered) sent++;
    console.log(`  ${r.email}: credits ${claim ? `+${MAKE_GOOD_CREDITS} ✅` : "already granted"} · email ${delivered ? "sent ✅" : "FAILED ❌"}`);
    // Resend free tier is rate-limited (~2 req/s) — pace the sends.
    await new Promise((res) => setTimeout(res, 600));
  }
  console.log(`\nDone. Credits granted: ${granted}/${reachable.length} · emails delivered: ${sent}/${reachable.length}`);
  process.exit(sent === reachable.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
