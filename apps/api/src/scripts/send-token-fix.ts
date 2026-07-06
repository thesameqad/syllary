import "../load-env.js";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { emailLog, songs, users } from "../db/schema.js";
import { env } from "../env.js";
import { buildTokenFixEmail, sendOnce } from "../lib/email.js";

// "Token fix" apology for the first reel subscriber (Jul 2026) — sent once,
// after manually topping up his credits. Deduped via sendOnce, so re-running
// is safe. MUST run with the production APP_URL so links aren't localhost:
//   APP_URL=https://syllary.com pnpm --filter @syllary/api exec \
//     tsx src/scripts/send-token-fix.ts
const TO = "musicwiesinger@gmail.com";
const KIND = "token_fix_reel_jul2026";
// --test → send an exact copy (his greeting, his CTA) to the founder via direct
// Resend, bypassing the email_log dedupe so it's re-runnable.
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

  const [u] = await db
    .select({
      id: users.id,
      email: users.email,
      emailOptOut: users.emailOptOut,
      name: users.displayName,
    })
    .from(users)
    .where(eq(users.email, TO))
    .limit(1);
  if (!u || !u.email) throw new Error(`No user row found for ${TO}.`);

  // Deep-link the CTA to his song page (falls back to /recent).
  const [song] = await db
    .select({ id: songs.id })
    .from(songs)
    .where(eq(songs.userId, u.id))
    .orderBy(desc(songs.createdAt))
    .limit(1);
  const ctaUrl = song ? `${env.APP_URL}/s/${song.id}` : `${env.APP_URL}/recent`;

  if (process.argv.includes("--test")) {
    const { subject, html } = buildTokenFixEmail({ firstName: firstNameOf(u.name), ctaUrl });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [TEST_TO], subject, html }),
    });
    console.log(`TEST copy → ${TEST_TO}`);
    console.log(`CTA:     ${ctaUrl}`);
    console.log(`Resend:  ${res.status} ${res.ok ? "OK ✅" : "FAILED ❌"}`);
    process.exit(res.ok ? 0 : 1);
  }

  await sendOnce({ id: u.id, email: u.email, emailOptOut: u.emailOptOut }, KIND, () =>
    buildTokenFixEmail({ firstName: firstNameOf(u.name), ctaUrl }),
  );

  // email_log only keeps the row when delivery succeeded (failures roll back).
  const [delivered] = await db
    .select({ sentAt: emailLog.sentAt })
    .from(emailLog)
    .where(and(eq(emailLog.userId, u.id), eq(emailLog.kind, KIND)))
    .limit(1);
  console.log(`To:      ${u.email}`);
  console.log(`CTA:     ${ctaUrl}`);
  console.log(delivered ? `Sent ✅  (${String(delivered.sentAt)})` : "NOT sent ❌ — check RESEND_API_KEY / logs.");
  process.exit(delivered ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
