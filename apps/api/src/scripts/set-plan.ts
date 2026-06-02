import "../load-env.js";
import { sql } from "drizzle-orm";
import { PLAN_CREDITS, PLANS, type Plan } from "@syllary/shared";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

// Manually grant a paid plan to a user (for testers), bypassing Stripe. The user
// must have signed up first. Safe: we leave stripe_customer_id NULL so the /me
// reconcile never runs and never resets the plan.
//   DATABASE_URL=<prod-pooler-url> npx tsx src/scripts/set-plan.ts <email> <starter|creator|pro|reel|studio|premiere>

// Monthly song cap per paid plan; null = unlimited (video plans are token-gated).
const SONG_QUOTA: Record<Exclude<Plan, "free">, number | null> = {
  starter: 30,
  creator: 100,
  pro: 400,
  reel: null,
  studio: null,
  premiere: null,
};

const [email, tierArg] = process.argv.slice(2);
if (!email || !tierArg || !PLANS.includes(tierArg as Plan) || tierArg === "free") {
  console.error("Usage: tsx src/scripts/set-plan.ts <email> <starter|creator|pro|reel|studio|premiere>");
  process.exit(1);
}
const tier = tierArg as Exclude<Plan, "free">;
const periodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

const [updated] = await db
  .update(users)
  .set({
    plan: tier,
    planStatus: "active",
    monthlyQuota: SONG_QUOTA[tier],
    credits: PLAN_CREDITS[tier],
    currentPeriodEnd: periodEnd,
    songsThisPeriod: 0,
    updatedAt: new Date(),
  })
  .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
  .returning();

if (!updated) {
  console.error(`No user found with email ${email}. Have them sign up first, then re-run.`);
  process.exit(1);
}
const quotaLabel = SONG_QUOTA[tier] === null ? "unlimited songs" : `${SONG_QUOTA[tier]} songs/mo`;
console.log(`✓ ${email} → ${tier} (credits ${PLAN_CREDITS[tier]}, ${quotaLabel}, valid 1 year)`);
process.exit(0);
