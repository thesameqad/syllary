import "../load-env.js";
import { isNotNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { conversionExports, users } from "../db/schema.js";

// Read-only audit of the offline-conversion pipeline: how many purchase rows
// are queued for Google Ads import, and how many payers have a captured gclid
// at all (queueAdConversion only fires for click-attributed users).
async function main(): Promise<void> {
  const byName = await db
    .select({
      name: conversionExports.conversionName,
      source: conversionExports.source,
      n: sql<number>`count(*)::int`,
      totalUsd: sql<string>`round(sum(${conversionExports.valueCents})/100.0, 2)::text`,
      first: sql<string>`min(${conversionExports.conversionAt})::text`,
      last: sql<string>`max(${conversionExports.conversionAt})::text`,
      unexported: sql<number>`count(*) filter (where ${conversionExports.exportedAt} is null)::int`,
    })
    .from(conversionExports)
    .groupBy(conversionExports.conversionName, conversionExports.source);

  const [payers] = await db
    .select({
      totalPayers: sql<number>`count(*)::int`,
      withClickId: sql<number>`count(*) filter (where ${users.acquisitionClickId} is not null)::int`,
    })
    .from(users)
    .where(isNotNull(users.firstSubBonusAt));

  console.log(JSON.stringify({ conversionExports: byName, payers }, null, 1));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
