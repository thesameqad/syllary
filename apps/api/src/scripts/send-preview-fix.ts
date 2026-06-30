import "../load-env.js";
import { eq, gte } from "drizzle-orm";
import { db } from "../db/client.js";
import { emailLog, users } from "../db/schema.js";
import { env } from "../env.js";
import { buildPreviewFixEmail, sendOnce } from "../lib/email.js";

// "Preview fix" re-engagement email.
//   (default)  → TEST send to the founder only, via direct Resend (re-runnable).
//   --blast    → send to signups from the last 30h via sendOnce (dedupe-safe,
//                skips opt-outs, carries an unsubscribe link). MUST run with the
//                production APP_URL so links aren't localhost:
//                  APP_URL=https://syllary.com pnpm --filter @syllary/api exec \
//                    tsx src/scripts/send-preview-fix.ts --blast
const TEST_TO = "thesameqad@gmail.com";
const KIND = "preview_fix_jun24";
const WINDOW_HOURS = 30; // safely covers the recent-signup batch

function firstNameOf(name: string | null): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : null;
}

async function testSend(): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not set — cannot send.");
  const [founder] = await db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(eq(users.email, TEST_TO))
    .limit(1);
  if (!founder) throw new Error(`No user row found for ${TEST_TO}.`);
  const { subject, html } = buildPreviewFixEmail({
    userId: founder.id,
    firstName: firstNameOf(founder.name),
  });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [TEST_TO], subject, html }),
  });
  console.log(`TEST → ${TEST_TO}`);
  console.log(`Button:  ${env.APP_URL}/recent`);
  console.log(`Resend:  ${res.status} ${res.ok ? "OK ✅" : "FAILED ❌"}`);
  console.log(await res.text());
  process.exit(res.ok ? 0 : 1);
}

async function blast(): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not set — cannot send.");
  // Safety: never blast localhost/dev links to real users.
  if (!env.APP_URL.startsWith("https://")) {
    throw new Error(
      `APP_URL is "${env.APP_URL}" — refusing to blast non-production links. Re-run with APP_URL=https://syllary.com.`,
    );
  }
  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);
  const recipients = await db
    .select({ id: users.id, email: users.email, emailOptOut: users.emailOptOut, name: users.displayName })
    .from(users)
    .where(gte(users.createdAt, since))
    .orderBy(users.createdAt);

  console.log(`Recipients (signed up in last ${WINDOW_HOURS}h): ${recipients.length}`);
  console.log(`Links → ${env.APP_URL}/recent  ·  kind="${KIND}"`);
  for (const u of recipients) {
    if (!u.email) continue;
    await sendOnce(
      { id: u.id, email: u.email, emailOptOut: u.emailOptOut },
      KIND,
      () => buildPreviewFixEmail({ userId: u.id, firstName: firstNameOf(u.name) }),
      { marketing: true },
    );
  }
  // email_log only keeps a row when delivery succeeded (failures roll back), so
  // this query is the true "actually delivered" list.
  const delivered = await db
    .select({ email: users.email })
    .from(emailLog)
    .innerJoin(users, eq(emailLog.userId, users.id))
    .where(eq(emailLog.kind, KIND));
  const optedOut = recipients.filter((u) => u.emailOptOut).length;
  console.log(`\nDelivered (${delivered.length}):`);
  for (const r of delivered) console.log(`  ✅ ${r.email}`);
  if (optedOut > 0) console.log(`Skipped (opted out): ${optedOut}`);
  process.exit(0);
}

const run = process.argv.includes("--blast") ? blast : testSend;
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
