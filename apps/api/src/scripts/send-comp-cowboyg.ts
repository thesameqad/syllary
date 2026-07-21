import "../load-env.js";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { emailLog, users } from "../db/schema.js";
import { env } from "../env.js";
import { buildCompVideoEmail, sendOnce } from "../lib/email.js";

// One-off (Jul 20 2026): cowboyg2022@gmail.com replied "need to see it before
// I pay" → founder comped a full Cinematic render of "Diamond Cowgirl" and
// approved this send. Deduped via email_log; safe to re-run.
//
//   APP_URL=https://syllary.com pnpm tsx --env-file=../../.env src/scripts/send-comp-cowboyg.ts
const TO = "cowboyg2022@gmail.com";
const KIND = "comp_video_jul20";
const SONG_ID = "de0dae93-70f8-485b-83d0-3577510cce32";
const SONG_TITLE = "Diamond Cowgirl";

async function main(): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not set.");
  if (!env.APP_URL.startsWith("https://")) throw new Error("Run with APP_URL=https://syllary.com");

  const [u] = await db
    .select({ id: users.id, email: users.email, emailOptOut: users.emailOptOut, name: users.displayName })
    .from(users)
    .where(eq(users.email, TO))
    .limit(1);
  if (!u?.email) throw new Error(`No user row for ${TO}.`);

  const first = u.name?.trim().split(/\s+/)[0] || null;
  await sendOnce({ id: u.id, email: u.email, emailOptOut: u.emailOptOut }, KIND, () =>
    buildCompVideoEmail({ firstName: first, songTitle: SONG_TITLE, ctaUrl: `${env.APP_URL}/s/${SONG_ID}` }),
  );
  const [delivered] = await db
    .select({ sentAt: emailLog.sentAt })
    .from(emailLog)
    .where(and(eq(emailLog.userId, u.id), eq(emailLog.kind, KIND)))
    .limit(1);
  console.log(delivered ? `Sent ✅ (${String(delivered.sentAt)})` : "NOT sent ❌");
  process.exit(delivered ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
