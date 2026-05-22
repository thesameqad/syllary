import "../load-env.js";
import Stripe from "stripe";
import { env } from "../env.js";

// Creates (or reuses) the Syllary product catalog in the Stripe account behind
// STRIPE_SECRET_KEY, then prints the price IDs to paste into your env. Idempotent
// via per-price `lookup_key`, so re-running is safe. Run once per account/mode:
//   STRIPE_SECRET_KEY=sk_test_... pnpm --filter @syllary/api setup:stripe   (test)
//   STRIPE_SECRET_KEY=sk_live_... pnpm --filter @syllary/api setup:stripe   (live)
//
// Prices reflect CLAUDE.md pricing; quota lives in price metadata (the app reads
// it from there). Amounts are in cents (USD).

if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
const stripe = new Stripe(env.STRIPE_SECRET_KEY);

type Tier = "starter" | "creator" | "pro";
const CATALOG: { tier: Tier; name: string; quota: number; monthly: number; annual: number }[] = [
  { tier: "starter", name: "Syllary Starter", quota: 30, monthly: 600, annual: 4800 },
  { tier: "creator", name: "Syllary Creator", quota: 100, monthly: 1400, annual: 12000 },
  { tier: "pro", name: "Syllary Pro", quota: 400, monthly: 2900, annual: 24000 },
];

async function findProduct(tier: Tier): Promise<Stripe.Product | null> {
  // No products search dependency: scan active products and match our metadata.
  for await (const product of stripe.products.list({ active: true, limit: 100 })) {
    if (product.metadata?.app === "syllary" && product.metadata?.tier === tier) return product;
  }
  return null;
}

async function ensureProduct(tier: Tier, name: string): Promise<Stripe.Product> {
  const existing = await findProduct(tier);
  if (existing) return existing;
  return stripe.products.create({ name, metadata: { app: "syllary", tier } });
}

async function ensurePrice(
  productId: string,
  tier: Tier,
  period: "monthly" | "annual",
  amount: number,
  quota: number,
): Promise<Stripe.Price> {
  const lookupKey = `syllary_${tier}_${period}`;
  const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1, active: true });
  if (found.data[0]) return found.data[0];
  return stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: amount,
    recurring: { interval: period === "monthly" ? "month" : "year" },
    lookup_key: lookupKey,
    metadata: { tier, billing_period: period, monthly_song_quota: String(quota) },
  });
}

const envLines: string[] = [];

for (const item of CATALOG) {
  const product = await ensureProduct(item.tier, item.name);
  const monthly = await ensurePrice(product.id, item.tier, "monthly", item.monthly, item.quota);
  const annual = await ensurePrice(product.id, item.tier, "annual", item.annual, item.quota);
  const T = item.tier.toUpperCase();
  envLines.push(`STRIPE_PRICE_${T}_MONTHLY=${monthly.id}`);
  envLines.push(`STRIPE_PRICE_${T}_YEARLY=${annual.id}`);
  console.log(`✓ ${item.name}: monthly=${monthly.id} annual=${annual.id}`);
}

console.log("\nPaste these into your env (and Render dashboard):\n");
console.log(envLines.join("\n"));
console.log("\nDone. Catalog is idempotent — re-running reuses the same prices.");
