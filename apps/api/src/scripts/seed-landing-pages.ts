import "../load-env.js";
import { sql } from "drizzle-orm";
import { createLandingSchema, type LandingBlock, renderBlocksToHtml } from "@syllary/shared";
import { db } from "../db/client.js";
import { landingPages } from "../db/schema.js";
import { BANNED_STRINGS, type SeedPage, VALID_TOOL_KEYS } from "./landing/types.js";
import { ensureMinFaqs } from "./landing/faq-pool.js";
import { COMPARISON_PAGES } from "./landing/comparison.js";
import { HOWTO_PAGES } from "./landing/how-to.js";
import { FORMAT_PAGES } from "./landing/format.js";
import { AI_MUSIC_PAGES } from "./landing/ai-music.js";
import { ADDED_PAGES } from "./landing/added.js";
import { MINI_PAGES } from "./landing/mini.js";

// ---------------------------------------------------------------------------
// Seed the programmatic SEO landing pages from typed, per-bucket content
// modules. Validates every row (schema + meta length + banned strings + tool
// keys + related-link targets), runs a self-similarity check, upserts on slug,
// and prints the §6 report. Idempotent: safe to re-run.
//   DATABASE_URL=<pooler-url> npx tsx src/scripts/seed-landing-pages.ts
// ---------------------------------------------------------------------------

const BUCKETS: Record<string, SeedPage[]> = {
  comparison: COMPARISON_PAGES,
  how_to: HOWTO_PAGES,
  format: FORMAT_PAGES,
  ai_music: AI_MUSIC_PAGES,
  added: ADDED_PAGES,
  mini: MINI_PAGES,
};

const all: SeedPage[] = Object.values(BUCKETS).flat();
// Guarantee every page has at least 3 FAQs (one alone looks sparse). Applied
// before validation/upsert so plainText, schema, and rendered HTML all reflect
// the topped-up set.
for (const p of all) p.faq = ensureMinFaqs(p);
const batchSlugs = new Set(all.map((p) => `/${p.slug}`));

const errors: string[] = [];
const warnings: string[] = [];

// Unique body content for the similarity check — deliberately EXCLUDES the
// shared CTA (identical on every page by design) and navigational relatedLinks,
// so the metric measures genuine content overlap, not shared boilerplate.
function plainText(p: SeedPage): string {
  const parts: string[] = [p.title, p.metaTitle, p.metaDescription];
  const walk = (b: LandingBlock) => {
    if (b.kind === "ctaCard" || b.kind === "relatedLinks" || b.kind === "toolEmbed") return;
    if ("text" in b && typeof b.text === "string") parts.push(b.text);
    if (b.kind === "heading") parts.push(b.text);
    if (b.kind === "definition") parts.push(b.term, b.text);
    if (b.kind === "list") parts.push(...b.items);
    if (b.kind === "badges") parts.push(...b.items);
    if (b.kind === "steps") b.items.forEach((s) => parts.push(s.title, s.text ?? ""));
    if (b.kind === "table") b.rows.forEach((r) => parts.push(...r));
  };
  p.blocks.forEach(walk);
  (p.faq ?? []).forEach((f) => parts.push(f.q, f.a));
  return parts.join(" \n ");
}

// --- Validation ---
const seen = new Set<string>();
for (const p of all) {
  if (seen.has(p.slug)) errors.push(`${p.slug}: duplicate slug in seed data`);
  seen.add(p.slug);

  if (p.metaTitle.length > 60) errors.push(`${p.slug}: meta_title ${p.metaTitle.length}>60 chars`);
  if (p.metaDescription.length > 155)
    errors.push(`${p.slug}: meta_description ${p.metaDescription.length}>155 chars`);

  if (p.renderType === "tool" && (!p.toolKey || !VALID_TOOL_KEYS.includes(p.toolKey as never)))
    errors.push(`${p.slug}: invalid/missing tool_key "${p.toolKey}"`);

  const haystack = plainText(p);
  for (const banned of BANNED_STRINGS) {
    const re = new RegExp(`\\b${banned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(haystack)) errors.push(`${p.slug}: banned tech/vendor string "${banned}"`);
  }

  for (const b of p.blocks) {
    if (b.kind === "relatedLinks") {
      for (const item of b.items) {
        if (/^\/(convert|tools|compare|guides)\//.test(item.href) && !batchSlugs.has(item.href)) {
          warnings.push(`${p.slug}: relatedLink ${item.href} not in this batch (must exist in DB)`);
        }
      }
    }
  }

  const parsed = createLandingSchema.safeParse({
    ...p,
    toolKey: p.toolKey ?? null,
    faq: p.faq ?? null,
  });
  if (!parsed.success) errors.push(`${p.slug}: schema — ${parsed.error.issues[0]?.message}`);
}

// --- Self-similarity (Jaccard on word sets within a category) ---
function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().match(/[a-z0-9']+/g) ?? []);
}
function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter || 1);
}
const byCategory = new Map<string, SeedPage[]>();
for (const p of all) (byCategory.get(p.category) ?? byCategory.set(p.category, []).get(p.category)!).push(p);
const similar: string[] = [];
for (const group of byCategory.values()) {
  const toks = group.map((p) => tokens(plainText(p)));
  for (let i = 0; i < group.length; i++)
    for (let j = i + 1; j < group.length; j++) {
      const sim = jaccard(toks[i]!, toks[j]!);
      if (sim > 0.6) similar.push(`${group[i]!.slug} ~ ${group[j]!.slug} (${(sim * 100).toFixed(0)}%)`);
    }
}

if (errors.length) {
  console.error("✗ Validation failed — fix before seeding:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

// --- Upsert ---
const rows = all.map((p) => ({
  slug: p.slug,
  category: p.category,
  renderType: p.renderType,
  toolKey: p.toolKey ?? null,
  title: p.title,
  metaTitle: p.metaTitle,
  metaDescription: p.metaDescription,
  blocks: p.blocks,
  faq: p.faq ?? null,
  renderedHtml: renderBlocksToHtml(p.title, p.blocks, p.faq ?? null),
  status: "published" as const,
  publishedAt: new Date(),
}));

const upserted = rows.length
  ? await db
      .insert(landingPages)
      .values(rows)
      .onConflictDoUpdate({
        target: landingPages.slug,
        set: {
          category: sql`excluded.category`,
          renderType: sql`excluded.render_type`,
          toolKey: sql`excluded.tool_key`,
          title: sql`excluded.title`,
          metaTitle: sql`excluded.meta_title`,
          metaDescription: sql`excluded.meta_description`,
          blocks: sql`excluded.blocks`,
          faq: sql`excluded.faq`,
          renderedHtml: sql`excluded.rendered_html`,
          status: sql`excluded.status`,
          updatedAt: sql`now()`,
        },
      })
      .returning()
  : [];

// --- Report (§6) ---
console.log("\n=== Seed report ===");
for (const [bucket, pages] of Object.entries(BUCKETS)) console.log(`  ${bucket}: ${pages.length}`);
console.log(`  TOTAL: ${all.length} (upserted ${upserted.length})`);
console.log(`  banned-string hits: 0`);
console.log(`  similarity flags (>60%): ${similar.length}`);
for (const s of similar) console.log("    ! " + s);
console.log(`  related-link warnings: ${warnings.length}`);
for (const w of warnings) console.log("    ? " + w);
console.log("===================\n");
process.exit(0);
