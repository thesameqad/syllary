import "../load-env.js";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { emailLog, songs, users, videoJobs } from "../db/schema.js";
import { env } from "../env.js";
import { compClaimUrl } from "../lib/comp-claim.js";
import { buildCompClaimEmail, sendOnce } from "../lib/email.js";
import { captureServer } from "../lib/posthog.js";

// Send the comp full-video claim ("gift") email for one user+song. Manual
// trigger for now — the T+3h automation reuses this exact machinery later.
//
//   API_BASE_URL=http://localhost:3000 APP_URL=http://localhost:5173 \
//     pnpm tsx --env-file=../../.env src/scripts/send-comp-claim.ts <email> <songId> [--print-link]
const emailArg = process.argv[2];
const songIdArg = process.argv[3];
if (!emailArg || !songIdArg) {
  console.error("Usage: send-comp-claim.ts <email> <songId> [--print-link]");
  process.exit(1);
}
// Narrowed copies (TS doesn't carry the guard into the async closure).
const email: string = emailArg;
const songId: string = songIdArg;
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";
const EXPIRES_HOURS = 24;

async function main(): Promise<void> {
  // Resolve via the song's OWNER (an email can map to several Clerk accounts).
  const [song] = await db.select().from(songs).where(eq(songs.id, songId)).limit(1);
  if (!song?.userId) throw new Error("Song not found (or anonymous).");
  const [u] = await db
    .select({ id: users.id, email: users.email, emailOptOut: users.emailOptOut, name: users.displayName, claimed: users.compVideoClaimedAt })
    .from(users)
    .where(eq(users.id, song.userId))
    .limit(1);
  if (!u?.email) throw new Error("Song owner has no email.");
  if (u.email !== email) throw new Error(`Song owner is ${u.email}, not ${email} — aborting.`);
  if (u.claimed) console.warn(`NOTE: user already claimed their comp video (${String(u.claimed)}) — link will redirect, not re-gift.`);
  const [preview] = await db
    .select({ id: videoJobs.id })
    .from(videoJobs)
    .where(and(eq(videoJobs.songId, songId), eq(videoJobs.userId, u.id), eq(videoJobs.isPreview, true)))
    .orderBy(desc(videoJobs.createdAt))
    .limit(1);
  if (!preview) throw new Error("This song has no preview — the claim flow inherits its settings.");

  const expires = Math.floor(Date.now() / 1000) + EXPIRES_HOURS * 3600;
  const url = compClaimUrl(API_BASE, u.id, songId, expires);
  console.log(`Claim link (${EXPIRES_HOURS}h):\n${url}\n`);
  if (process.argv.includes("--print-link")) process.exit(0);

  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not set.");
  const first = u.name?.trim().split(/\s+/)[0] || null;
  const title = song.title || "your song";
  await sendOnce({ id: u.id, email: u.email, emailOptOut: u.emailOptOut }, `comp_claim:${songId}`, () =>
    buildCompClaimEmail({ firstName: first, songTitle: title, claimUrl: url }),
  );
  const [delivered] = await db
    .select({ sentAt: emailLog.sentAt })
    .from(emailLog)
    .where(and(eq(emailLog.userId, u.id), eq(emailLog.kind, `comp_claim:${songId}`)))
    .limit(1);
  if (delivered) {
    // First step of the gift funnel (comp_claim_sent → comp_claimed →
    // comp_video_generated → plans_modal_viewed → checkout → subscribed).
    captureServer(song.ownerHash, "comp_claim_sent", { song_id: songId });
  }
  console.log(delivered ? `Sent ✅ (${String(delivered.sentAt)})` : "NOT sent ❌");
  process.exit(delivered ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
