import { z } from "zod";

// ---------------------------------------------------------------------------
// Programmatic SEO landing pages.
//
// One template renders every row of the `landing_pages` table. Pages are either
// static content (comparison / how-to) or mount a mini-tool by key. The schemas
// here are the single source of truth shared by the API (validation + the
// publish-time HTML snapshot) and the web app (template + admin editor).
// ---------------------------------------------------------------------------

/** URL section a page lives under. The category is also the path prefix:
 *  `/convert/...`, `/tools/...`, `/compare/...`, `/guides/...`. */
export const LANDING_CATEGORIES = [
  { id: "convert", label: "Converter", prefix: "convert" },
  { id: "tools", label: "Tool", prefix: "tools" },
  { id: "compare", label: "Comparison", prefix: "compare" },
  { id: "guides", label: "Guide", prefix: "guides" },
] as const;

export const LANDING_CATEGORY_IDS = LANDING_CATEGORIES.map((c) => c.id) as [
  "convert",
  "tools",
  "compare",
  "guides",
];

export const landingCategorySchema = z.enum(LANDING_CATEGORY_IDS);
export type LandingCategory = z.infer<typeof landingCategorySchema>;

/** The known path prefixes the SEO worker intercepts. Keep in sync with the
 *  worker route patterns and the web router. */
export const LANDING_PREFIXES = LANDING_CATEGORIES.map((c) => c.prefix);

/** A `content` page is pure text blocks; a `tool` page mounts a mini-tool. */
export const landingRenderTypeSchema = z.enum(["content", "tool"]);
export type LandingRenderType = z.infer<typeof landingRenderTypeSchema>;

export const landingStatusSchema = z.enum(["draft", "published"]);
export type LandingStatus = z.infer<typeof landingStatusSchema>;

// ---------------------------------------------------------------------------
// Content blocks — a deliberately small, textual set so the publish-time HTML
// snapshot is clean, semantic, crawlable markup (and the editor stays simple).
// ---------------------------------------------------------------------------

export const landingBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("heading"), level: z.union([z.literal(2), z.literal(3)]), text: z.string() }),
  z.object({ kind: z.literal("paragraph"), text: z.string() }),
  z.object({ kind: z.literal("list"), ordered: z.boolean().default(false), items: z.array(z.string()) }),
  z.object({ kind: z.literal("callout"), text: z.string() }),
  z.object({ kind: z.literal("table"), headers: z.array(z.string()), rows: z.array(z.array(z.string())) }),
  z.object({ kind: z.literal("cta"), label: z.string(), href: z.string() }),
  z.object({ kind: z.literal("image"), src: z.string(), alt: z.string() }),
  // Marks where a mini-tool mounts in the flow (used on `tool` pages so marketing
  // copy can sit above/below the interactive tool).
  z.object({ kind: z.literal("toolEmbed"), toolKey: z.string() }),
  // --- Rich presentational blocks (styled cards/chips; still semantic HTML in
  // the crawler snapshot) ---
  // Eyebrow chip row; the first chip is accent-highlighted.
  z.object({ kind: z.literal("badges"), items: z.array(z.string()) }),
  // Numbered step cards (title + optional sub-text).
  z.object({
    kind: z.literal("steps"),
    items: z.array(z.object({ title: z.string(), text: z.string().optional() })),
  }),
  // Monospace code/example card. `caption` renders muted below the card.
  z.object({ kind: z.literal("code"), code: z.string(), caption: z.string().optional() }),
  // Bordered call-to-action panel (heading + body + button).
  z.object({
    kind: z.literal("ctaCard"),
    title: z.string(),
    text: z.string(),
    label: z.string(),
    href: z.string(),
  }),
  // "Related pages" chips — internal links to sibling landing pages.
  z.object({
    kind: z.literal("relatedLinks"),
    title: z.string().optional(),
    items: z.array(z.object({ label: z.string(), href: z.string() })),
  }),
  // Definition lead for "what is X" pages: a crisp term + 1–2 sentence answer,
  // rendered prominently and surfaced as DefinedTerm JSON-LD.
  z.object({ kind: z.literal("definition"), term: z.string(), text: z.string() }),
]);
export type LandingBlock = z.infer<typeof landingBlockSchema>;

export const faqItemSchema = z.object({ q: z.string(), a: z.string() });
export type FaqItem = z.infer<typeof faqItemSchema>;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

/** Public DTO returned by `GET /api/landing/*`. Consumed by the React template
 *  AND the SEO worker (which injects `renderedHtml` + meta into the shell). */
export const landingPageSchema = z.object({
  slug: z.string(),
  category: landingCategorySchema,
  renderType: landingRenderTypeSchema,
  toolKey: z.string().nullable(),
  title: z.string(),
  metaTitle: z.string(),
  metaDescription: z.string(),
  ogImageUrl: z.string().nullable(),
  canonicalUrl: z.string().nullable(),
  noindex: z.boolean(),
  blocks: z.array(landingBlockSchema),
  faq: z.array(faqItemSchema).nullable(),
  /** Server-rendered static HTML of the body, for crawlers. */
  renderedHtml: z.string().nullable(),
});
export type LandingPage = z.infer<typeof landingPageSchema>;

/** Admin list/detail row (adds id, status, timestamps). */
export const landingAdminSchema = landingPageSchema
  .omit({ renderedHtml: true })
  .extend({
    id: z.string(),
    status: landingStatusSchema,
    ogImageKey: z.string().nullable(),
    publishedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  });
export type LandingAdmin = z.infer<typeof landingAdminSchema>;

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

/** Create input. `slug` is the full path after the domain (no leading slash),
 *  e.g. "convert/lrc-to-ttml"; its first segment must match `category`. */
export const createLandingSchema = z
  .object({
    slug: z.string().regex(slugRegex, "Use lowercase words separated by - and /"),
    category: landingCategorySchema,
    renderType: landingRenderTypeSchema,
    toolKey: z.string().nullable().default(null),
    title: z.string().min(1),
    metaTitle: z.string().min(1),
    metaDescription: z.string().min(1),
    ogImageKey: z.string().nullable().default(null),
    canonicalUrl: z.string().url().nullable().default(null),
    noindex: z.boolean().default(false),
    blocks: z.array(landingBlockSchema).default([]),
    faq: z.array(faqItemSchema).nullable().default(null),
  })
  .refine((v) => v.slug.split("/")[0] === v.category, {
    message: "The slug's first segment must match the category.",
    path: ["slug"],
  })
  .refine((v) => v.renderType !== "tool" || Boolean(v.toolKey), {
    message: "Tool pages require a toolKey.",
    path: ["toolKey"],
  });
export type CreateLanding = z.infer<typeof createLandingSchema>;

/** Update input — every field optional; same cross-field rules applied in the route. */
export const updateLandingSchema = z.object({
  slug: z.string().regex(slugRegex).optional(),
  category: landingCategorySchema.optional(),
  renderType: landingRenderTypeSchema.optional(),
  toolKey: z.string().nullable().optional(),
  title: z.string().min(1).optional(),
  metaTitle: z.string().min(1).optional(),
  metaDescription: z.string().min(1).optional(),
  ogImageKey: z.string().nullable().optional(),
  canonicalUrl: z.string().url().nullable().optional(),
  noindex: z.boolean().optional(),
  blocks: z.array(landingBlockSchema).optional(),
  faq: z.array(faqItemSchema).nullable().optional(),
});
export type UpdateLanding = z.infer<typeof updateLandingSchema>;

// ---------------------------------------------------------------------------
// Per-page funnel analytics (admin dashboard).
// ---------------------------------------------------------------------------

export const landingFunnelSchema = z.object({
  slug: z.string(),
  title: z.string(),
  category: landingCategorySchema,
  status: landingStatusSchema,
  visits: z.number(),
  freeSongs: z.number(),
  registrations: z.number(),
  registeredSongs: z.number(),
  /** Paid upgrades attributed to this page, keyed by plan id. */
  upgradesByPlan: z.record(z.string(), z.number()),
});
export type LandingFunnel = z.infer<typeof landingFunnelSchema>;

// ---------------------------------------------------------------------------
// Publish-time HTML snapshot. Pure + DOM-free so the API can call it in Node.
// The interactive React renderer (apps/web) is a separate implementation; this
// one only has to produce crawlable, semantic text.
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderBlock(block: LandingBlock): string {
  switch (block.kind) {
    case "heading":
      return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
    case "paragraph":
      return `<p>${escapeHtml(block.text)}</p>`;
    case "callout":
      return `<aside>${escapeHtml(block.text)}</aside>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const items = block.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
      return `<${tag}>${items}</${tag}>`;
    }
    case "table": {
      const head = `<tr>${block.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
      const body = block.rows
        .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
        .join("");
      return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
    }
    case "cta":
      return `<p><a href="${escapeHtml(block.href)}">${escapeHtml(block.label)}</a></p>`;
    case "image":
      return `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}" loading="lazy" />`;
    case "toolEmbed":
      // The interactive tool mounts client-side; crawlers get the marker only.
      return `<div data-tool="${escapeHtml(block.toolKey)}"></div>`;
    case "badges":
      return `<ul>${block.items.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`;
    case "steps": {
      const items = block.items
        .map(
          (s) =>
            `<li><strong>${escapeHtml(s.title)}</strong>${s.text ? ` — ${escapeHtml(s.text)}` : ""}</li>`,
        )
        .join("");
      return `<ol>${items}</ol>`;
    }
    case "code":
      return `<pre><code>${escapeHtml(block.code)}</code></pre>${block.caption ? `<p>${escapeHtml(block.caption)}</p>` : ""}`;
    case "ctaCard":
      return `<section><h2>${escapeHtml(block.title)}</h2><p>${escapeHtml(block.text)}</p><p><a href="${escapeHtml(block.href)}">${escapeHtml(block.label)}</a></p></section>`;
    case "relatedLinks": {
      const links = block.items
        .map((l) => `<li><a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a></li>`)
        .join("");
      return `${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ""}<ul>${links}</ul>`;
    }
    case "definition":
      return `<p><strong>${escapeHtml(block.term)}</strong> — ${escapeHtml(block.text)}</p>`;
  }
}

/** Render content blocks (+ optional FAQ) to a static HTML string for the
 *  crawler snapshot stored on the row at publish time. */
export function renderBlocksToHtml(
  title: string,
  blocks: LandingBlock[],
  faq?: FaqItem[] | null,
): string {
  const parts = [`<h1>${escapeHtml(title)}</h1>`, ...blocks.map(renderBlock)];
  if (faq && faq.length > 0) {
    parts.push("<section><h2>FAQ</h2>");
    for (const item of faq) {
      parts.push(`<h3>${escapeHtml(item.q)}</h3><p>${escapeHtml(item.a)}</p>`);
    }
    parts.push("</section>");
  }
  return parts.join("\n");
}
