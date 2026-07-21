import "../load-env.js";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { emailLog, users } from "../db/schema.js";
import { env } from "../env.js";
import { buildCheckoutRecoveryEmail, sendOnce } from "../lib/email.js";

// Personal founder recovery notes to the two failed-payment checkouts spotted
// in Stripe on Jul 16 2026 (john.vanburen24: $199/mo Premiere, card typo Jul 8;
// alang941: $390/yr Reel, Klarna decline Jul 1). Deduped per (user, kind) via
// email_log — safe to re-run.
//
//   APP_URL=https://syllary.com pnpm --filter @syllary/api exec \
//     tsx src/scripts/send-checkout-recovery.ts [--test]
const KIND = "checkout_recovery_jul16";
const TEST_TO = "thesameqad@gmail.com";

const RECIPIENTS: { email: string; songId: string; whatHappened: string }[] = [
  {
    email: "john.vanburen24@gmail.com",
    songId: "162b018c-b51a-4e6f-8f07-4b41d755b06b",
    whatHappened:
      "your Premiere checkout on July 8 didn't complete — the bank flagged a mistyped card number (one wrong digit does it, especially on a phone)",
  },
  {
    email: "alang941@gmail.com",
    songId: "3b8b4d84-bcef-4c3e-9c45-016eb6d2e742",
    whatHappened:
      "when you went for the annual Reel plan on July 1, Klarna declined the financing on their side — that's Klarna being Klarna, not anything you did",
  },
];

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

  for (const r of RECIPIENTS) {
    const [u] = await db
      .select({ id: users.id, email: users.email, emailOptOut: users.emailOptOut, name: users.displayName })
      .from(users)
      .where(eq(users.email, r.email))
      .limit(1);
    if (!u || !u.email) {
      console.error(`✗ No user row for ${r.email} — skipped.`);
      continue;
    }
    const ctaUrl = `${env.APP_URL}/s/${r.songId}`;

    if (process.argv.includes("--test")) {
      const { subject, html } = buildCheckoutRecoveryEmail({
        firstName: firstNameOf(u.name),
        ctaUrl,
        whatHappened: r.whatHappened,
      });
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: [TEST_TO], subject: `[TEST ${r.email}] ${subject}`, html }),
      });
      console.log(`TEST copy (${r.email}) → ${TEST_TO}: ${res.status} ${res.ok ? "OK ✅" : "FAILED ❌"}`);
      continue;
    }

    await sendOnce({ id: u.id, email: u.email, emailOptOut: u.emailOptOut }, KIND, () =>
      buildCheckoutRecoveryEmail({ firstName: firstNameOf(u.name), ctaUrl, whatHappened: r.whatHappened }),
    );
    const [delivered] = await db
      .select({ sentAt: emailLog.sentAt })
      .from(emailLog)
      .where(and(eq(emailLog.userId, u.id), eq(emailLog.kind, KIND)))
      .limit(1);
    console.log(`${u.email}: ${delivered ? `sent ✅ (${String(delivered.sentAt)})` : "NOT sent ❌"}`);
    await new Promise((res) => setTimeout(res, 600));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
