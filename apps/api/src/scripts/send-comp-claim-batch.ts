import "../load-env.js";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { emailLog, songs, users, videoJobs } from "../db/schema.js";
import { env } from "../env.js";
import { compClaimUrl } from "../lib/comp-claim.js";
import { buildCompClaimEmail, sendOnce } from "../lib/email.js";
import { captureServer, shutdownPosthog } from "../lib/posthog.js";

// Gift batch #2 (Jul 25 2026, founder-approved "send the rest"): the FULL
// "previewed → clicked full → saw paywall → never paid since Jul 17" cohort
// re-queried through Jul 25. Includes the pilot-18 — the once-ever email_log
// guard skips anyone who already got a claim link. v2 email (transactional
// subject + unsubscribe), 72h links against the PROD API.
//
//   APP_URL=https://syllary.com API_BASE_URL=https://api.syllary.com \
//     pnpm tsx --env-file=../../.env src/scripts/send-comp-claim-batch.ts [--dry-run]
//
// Excluded up front: chiefsvseagless (Glass Animals) + scoot784 (Megan Thee
// Stallion) — no comp for commercial tracks; jameslank1979 — existing payer;
// founder accounts. Review every dry-run title for covers before the real send.
const RECIPIENTS = [
  "creatergani@gmail.com",
  "fatelmemory@gmail.com",
  "jullietren@gmail.com",
  "noblejalen2@gmail.com",
  "maximej853@gmail.com",
  "ryaneckert13@gmail.com",
  "zombiedabsmoker@gmail.com",
  "redburdllc@gmail.com",
  "tthedisstrackshow@gmail.com",
  "bhuiyannihal7@gmail.com",
  "bosshogbossolini@gmail.com",
  "hotboyblack03@gmail.com",
  "masonniswonger@gmail.com",
  "antonioclassicmovies@gmail.com",
  "kurruptdaguru@gmail.com",
  "zoey.c.0409@gmail.com",
  "wyattkimsey74@gmail.com",
  "jbre9088@gmail.com",
  "massenburg.heav@gmail.com",
  "lovekashif757@gmail.com",
  "broush177@gmail.com",
  "gvk4yg7ydk@privaterelay.appleid.com",
  "tuck4699@gmail.com",
  "antonioporter83rd@yahoo.com",
  "colestrange25@gmail.com",
  "tcacademy3@aol.com",
  "thenewfreeza@gmail.com",
  "mdcollins0605@gmail.com",
  "hambuck1999@icloud.com",
  "michizon01@gmail.com",
  "mariopartyocho@gmail.com",
  "ali.feraidoony@gmail.com",
  "kodedak@gmail.com",
  "magic.of.kobranis@gmail.com",
  "sierrathurber176@gmail.com",
  "trevorcarrell29@gmail.com",
  "jjones122181@gmail.com",
  "mrs.luli@gmail.com",
  "dana.raeneal@gmail.com",
  "cidfnphoenix@gmail.com",
  "kickerking@yahoo.com",
  "simpsonjamarion01@gmail.com",
  "crashoutaristocrats@gmail.com",
  "irishfd777@gmail.com",
  "fendi2f86@gmail.com",
  "angels77729@yahoo.com",
  "jacobchap85@gmail.com",
  "rashkoj67@gmail.com",
  "dovej9945@gmail.com",
  "imtati05@gmail.com",
  "partygrandmat@gmail.com",
  "peteyslyricsnda209@gmail.com",
  "sonnybayze1@gmail.com",
  "normanthemorman2026@gmail.com",
  "mvmhs94zc4@privaterelay.appleid.com",
  "justenw03@gmail.com",
  "bigstunmusic@gmail.com",
  // efte.alam excluded: "Hoàng Thuỳ Linh - See Tình Remix" is a ripped commercial track — no comp for covers
  "comefindmeifyoucan@gmail.com",
  "bexeeboo25@gmail.com",
  "ezzjackboii@gmail.com",
  "adengoel80@gmail.com",
  "mclendonmichelle06@gmail.com",
  "tillidie590@gmail.com",
  "edmichelle9293@gmail.com",
  "marianaglz074@gmail.com",
  "patrick_bath@yahoo.com",
  "lil_ceaze_6@hotmail.com",
  "thanhlongcanhac@gmail.com",
  "wolfpack1937@gmail.com",
  "gavinwashington54@gmail.com",
  "jake10stargle89@gmail.com",
  "21ridgeal@gmail.com",
  "tylermoreno028@gmail.com",
  "excaliosereza@gmail.com",
  "acmccormick20@gmail.com",
  "faithandfavorva@gmail.com",
  "shaggyp2828@gmail.com",
  "spazztastic84@gmail.com",
  "darronj9114@gmail.com",
  "taylor.bratcher@gmail.com",
  "benny_j_elias@live.com",
  "hunterphelps96@gmail.com",
  "pikabear2008@gmail.com",
  "jh8njn9myz@privaterelay.appleid.com",
  "victor.debnath81@gmail.com",
  "voidwondermc@gmail.com",
  "ceelo444@gmail.com",
  // soullasassinrecordsllc excluded: "killing me sofly" is almost certainly a Killing Me Softly cover — no comp for covers
  "allenleonard73@gmail.com",
  "chappbrooke2@gmail.com",
  "burquefinest5@gmail.com",
  "jhakariholloway@gmail.com",
  "bloodbathgm@gmail.com",
  "makyatorrance@gmail.com",
  "christiantaylorbordelon@gmail.com",
  "rocksdisturbed@gmail.com",
  "angold24p@gmail.com",
  "gauthierj4@icloud.com",
  "adamalexander52weeks@gmail.com",
];
const API_BASE = process.env.API_BASE_URL ?? "https://api.syllary.com";
const EXPIRES_HOURS = 72;

async function main(): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not set.");
  if (!env.APP_URL.startsWith("https://")) {
    throw new Error(`APP_URL is "${env.APP_URL}" — run with APP_URL=https://syllary.com.`);
  }
  const dryRun = process.argv.includes("--dry-run");
  let sent = 0;
  let skipped = 0;

  for (const email of RECIPIENTS) {
    // Resolve the account THROUGH its previewed song (an email can map to
    // several Clerk accounts — pick the one that actually owns a ready preview).
    const [target] = await db
      .select({
        userId: users.id,
        name: users.displayName,
        emailOptOut: users.emailOptOut,
        claimed: users.compVideoClaimedAt,
        songId: songs.id,
        songTitle: songs.title,
        ownerHash: songs.ownerHash,
      })
      .from(songs)
      .innerJoin(users, eq(users.id, songs.userId))
      .where(
        and(
          eq(users.email, email),
          sql`exists (select 1 from ${videoJobs} v where v.song_id = ${songs.id} and v.is_preview = true and v.status = 'ready')`,
        ),
      )
      .orderBy(desc(songs.createdAt))
      .limit(1);
    if (!target) {
      console.log(`  ${email}: SKIP — no previewed song found`);
      skipped++;
      continue;
    }
    if (target.claimed) {
      console.log(`  ${email}: SKIP — already claimed`);
      skipped++;
      continue;
    }
    // One claim email per user EVER, regardless of song — don't re-mail the
    // pilot cohort with a new song's link.
    const [alreadyMailed] = await db
      .select({ id: emailLog.userId })
      .from(emailLog)
      .where(and(eq(emailLog.userId, target.userId), sql`${emailLog.kind} like 'comp_claim:%'`))
      .limit(1);
    if (alreadyMailed) {
      console.log(`  ${email}: SKIP — already received a claim email`);
      skipped++;
      continue;
    }

    const expires = Math.floor(Date.now() / 1000) + EXPIRES_HOURS * 3600;
    const url = compClaimUrl(API_BASE, target.userId, target.songId, expires);
    if (dryRun) {
      console.log(`  ${email}: would send for "${target.songTitle}"`);
      continue;
    }

    const first = target.name?.trim().split(/\s+/)[0] || null;
    await sendOnce(
      { id: target.userId, email, emailOptOut: target.emailOptOut },
      `comp_claim:${target.songId}`,
      () =>
        buildCompClaimEmail({
          userId: target.userId,
          firstName: first,
          songTitle: target.songTitle || "your song",
          claimUrl: url,
          expiresHours: EXPIRES_HOURS,
        }),
    );
    const [delivered] = await db
      .select({ sentAt: emailLog.sentAt })
      .from(emailLog)
      .where(and(eq(emailLog.userId, target.userId), eq(emailLog.kind, `comp_claim:${target.songId}`)))
      .limit(1);
    if (delivered) {
      captureServer(target.ownerHash, "comp_claim_sent", { song_id: target.songId, batch: "batch_2_jul25" });
      sent++;
      console.log(`  ${email}: sent ✅ ("${target.songTitle}")`);
    } else {
      console.log(`  ${email}: NOT sent ❌`);
    }
    await new Promise((r) => setTimeout(r, 700));
  }

  console.log(`\nDone: ${sent} sent, ${skipped} skipped, of ${RECIPIENTS.length}.`);
  await shutdownPosthog(); // flush comp_claim_sent events before the process exits
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await shutdownPosthog();
  process.exit(1);
});
