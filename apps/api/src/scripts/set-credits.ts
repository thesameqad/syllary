import "../load-env.js";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

// Manually set a user's token wallet (the `credits` column) — for testers/support.
//   DATABASE_URL=<prod-pooler-url> npx tsx src/scripts/set-credits.ts <email> <amount>

const [email, amountArg] = process.argv.slice(2);
const amount = Number(amountArg);
if (!email || !amountArg || !Number.isInteger(amount) || amount < 0) {
  console.error("Usage: tsx src/scripts/set-credits.ts <email> <non-negative-integer>");
  process.exit(1);
}

const [before] = await db
  .select({ id: users.id, email: users.email, credits: users.credits, plan: users.plan })
  .from(users)
  .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);

if (!before) {
  console.error(`No user found with email ${email}. Have them sign up first, then re-run.`);
  process.exit(1);
}

const [updated] = await db
  .update(users)
  .set({ credits: amount, updatedAt: new Date() })
  .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
  .returning({ email: users.email, credits: users.credits });

if (!updated) {
  console.error("Update failed — no row returned.");
  process.exit(1);
}

console.log(`✓ ${updated.email}: credits ${before.credits} → ${updated.credits} (plan ${before.plan})`);
process.exit(0);
