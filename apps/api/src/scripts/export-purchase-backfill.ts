import "../load-env.js";
import { and, isNotNull, notInArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

// One-off Google Ads "conversions from clicks" backfill: one purchase row per
// click-attributed payer, valued at their plan's monthly price, timestamped at
// first subscription. Upload target must be an IMPORT-type conversion action
// (website-tag actions reject click imports) — create "purchase_offline" in
// Google Ads first. gclid click window is 90 days, which covers the Jul 1+
// cohort.
//
//   pnpm tsx --env-file=../../.env src/scripts/export-purchase-backfill.ts > backfill.csv
const FOUNDER = ["thesameqad@gmail.com", "anton.yermolayev.us@gmail.com"];
const CONVERSION_NAME = "purchase_offline";

const PLAN_USD: Record<string, number> = {
  starter: 6,
  creator: 14,
  pro: 29,
  reel: 39,
  studio: 99,
  premiere: 199,
};
// Churned payers show plan='free' now — restore what they actually bought.
const CHURNED_PLAN: Record<string, number> = {
  "wygw4pjs2b@privaterelay.appleid.com": 14, // creator, Jul 27
  "almostaranch2020@gmail.com": 29, // pro, Jul 2
};

function conversionTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+0000`
  );
}

async function main(): Promise<void> {
  const rows = await db
    .select({
      email: users.email,
      plan: users.plan,
      clickId: users.acquisitionClickId,
      source: users.acquisitionClickSource,
      firstSub: users.firstSubBonusAt,
    })
    .from(users)
    .where(
      and(
        isNotNull(users.firstSubBonusAt),
        isNotNull(users.acquisitionClickId),
        notInArray(users.email, FOUNDER),
        sql`${users.email} not like '%@syllary.com'`,
        sql`${users.acquisitionClickSource} = 'google'`,
      ),
    );

  const lines = ["Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency"];
  let skipped = 0;
  for (const r of rows) {
    const value = PLAN_USD[r.plan] ?? CHURNED_PLAN[r.email ?? ""] ?? null;
    if (!r.clickId || !r.firstSub || value == null) {
      skipped++;
      continue;
    }
    lines.push([r.clickId, CONVERSION_NAME, conversionTime(r.firstSub), value.toFixed(2), "USD"].join(","));
  }
  console.log(lines.join("\n"));
  console.error(`rows: ${lines.length - 1}, skipped (no value resolvable): ${skipped}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
