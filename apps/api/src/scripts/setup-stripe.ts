import "../load-env.js";
import Stripe from "stripe";
import { env } from "../env.js";

if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
const stripe = new Stripe(env.STRIPE_SECRET_KEY);

const updates: [string | undefined, Record<string, string>][] = [
  [env.STRIPE_PRICE_STARTER_MONTHLY, { tier: "starter", billing_period: "monthly", monthly_song_quota: "30" }],
  [env.STRIPE_PRICE_STARTER_YEARLY, { tier: "starter", billing_period: "annual", monthly_song_quota: "30" }],
  [env.STRIPE_PRICE_CREATOR_MONTHLY, { tier: "creator", billing_period: "monthly", monthly_song_quota: "100" }],
  [env.STRIPE_PRICE_CREATOR_YEARLY, { tier: "creator", billing_period: "annual", monthly_song_quota: "100" }],
  [env.STRIPE_PRICE_PRO_MONTHLY, { tier: "pro", billing_period: "monthly", monthly_song_quota: "400" }],
  [env.STRIPE_PRICE_PRO_YEARLY, { tier: "pro", billing_period: "annual", monthly_song_quota: "400" }],
];

for (const [id, metadata] of updates) {
  if (!id) continue;
  await stripe.prices.update(id, { metadata });
  console.log(`set ${metadata.tier} ${metadata.billing_period} (quota ${metadata.monthly_song_quota}) -> ${id}`);
}
console.log("Stripe price metadata configured.");
