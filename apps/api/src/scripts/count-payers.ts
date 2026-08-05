import "../load-env.js";
import { isNotNull, and, notInArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

// Prints the all-time purchase (first-subscription) count, founder accounts
// excluded. Used by the scheduled "20 purchases" reminder that gates wiring
// purchase-value conversions into Google Ads (conversion-5x plan, lever 1).
//
//   pnpm tsx --env-file=../../.env src/scripts/count-payers.ts
const FOUNDER = ["thesameqad@gmail.com", "anton.yermolayev.us@gmail.com"];

async function main(): Promise<void> {
  const [row] = await db
    .select({
      payers: sql<number>`count(*)::int`,
      latest: sql<string>`max(${users.firstSubBonusAt})::text`,
    })
    .from(users)
    .where(
      and(
        isNotNull(users.firstSubBonusAt),
        notInArray(users.email, FOUNDER),
        sql`${users.email} not like '%@syllary.com'`,
      ),
    );
  console.log(JSON.stringify({ payers: row?.payers ?? 0, latestPurchase: row?.latest ?? null }));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
