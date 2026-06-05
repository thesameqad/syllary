import type { FastifyInstance } from "fastify";
import { and, desc, eq, ilike, isNotNull, ne, or, sql } from "drizzle-orm";
import {
  createLandingSchema,
  type LandingAdmin,
  landingCategorySchema,
  type LandingFunnel,
  type LandingPage,
  landingStatusSchema,
  renderBlocksToHtml,
  updateLandingSchema,
} from "@syllary/shared";
import { db } from "../db/client.js";
import { analyticsEvents, landingPages, type LandingPageRow, songs, users } from "../db/schema.js";
import { presignGet } from "../lib/r2.js";
import { requireAdmin } from "../lib/admin.js";

async function ogImageUrl(key: string | null): Promise<string | null> {
  return key ? presignGet(key) : null;
}

/** Public DTO (consumed by the React template + the SEO worker). */
async function toPublicDto(row: LandingPageRow): Promise<LandingPage> {
  return {
    slug: row.slug,
    category: row.category,
    renderType: row.renderType,
    toolKey: row.toolKey,
    title: row.title,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
    ogImageUrl: await ogImageUrl(row.ogImageKey),
    canonicalUrl: row.canonicalUrl,
    noindex: row.noindex,
    blocks: row.blocks,
    faq: row.faq,
    renderedHtml: row.renderedHtml,
  };
}

/** Admin DTO (list/detail + editor). */
async function toAdminDto(row: LandingPageRow): Promise<LandingAdmin> {
  return {
    id: row.id,
    slug: row.slug,
    category: row.category,
    renderType: row.renderType,
    toolKey: row.toolKey,
    title: row.title,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
    ogImageKey: row.ogImageKey,
    ogImageUrl: await ogImageUrl(row.ogImageKey),
    canonicalUrl: row.canonicalUrl,
    noindex: row.noindex,
    blocks: row.blocks,
    faq: row.faq,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const n = (v: unknown): number => Number(v ?? 0);

export async function landingRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------------
  // Public: fetch a published landing page by full slug (may contain "/").
  // -------------------------------------------------------------------------
  app.get<{ Params: { "*": string } }>("/landing/*", async (req, reply) => {
    const slug = req.params["*"].replace(/\/$/, "");
    const [row] = await db
      .select()
      .from(landingPages)
      .where(and(eq(landingPages.slug, slug), eq(landingPages.status, "published")))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "Not found." });
    return reply
      .header("cache-control", "public, max-age=120, s-maxage=120")
      .send(await toPublicDto(row));
  });

  // -------------------------------------------------------------------------
  // Admin (all behind the ADMIN_CLERK_IDS allowlist).
  // -------------------------------------------------------------------------
  app.get<{ Querystring: { status?: string; category?: string; q?: string } }>(
    "/admin/landing",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      const { status, category, q } = req.query;
      const filters = [];
      if (status && landingStatusSchema.safeParse(status).success) {
        filters.push(eq(landingPages.status, status as "draft" | "published"));
      }
      const cat = category ? landingCategorySchema.safeParse(category) : null;
      if (cat?.success) filters.push(eq(landingPages.category, cat.data));
      if (q) {
        filters.push(or(ilike(landingPages.slug, `%${q}%`), ilike(landingPages.title, `%${q}%`)));
      }
      const rows = await db
        .select()
        .from(landingPages)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(landingPages.updatedAt));
      return reply.send(await Promise.all(rows.map(toAdminDto)));
    },
  );

  app.get<{ Params: { id: string } }>("/admin/landing/:id", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const [row] = await db.select().from(landingPages).where(eq(landingPages.id, req.params.id)).limit(1);
    if (!row) return reply.code(404).send({ error: "Not found." });
    return reply.send(await toAdminDto(row));
  });

  app.post("/admin/landing", async (req, reply) => {
    const clerkId = await requireAdmin(req, reply);
    if (!clerkId) return;
    const parsed = createLandingSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid page." });
    }
    const data = parsed.data;
    const [existing] = await db
      .select({ id: landingPages.id })
      .from(landingPages)
      .where(eq(landingPages.slug, data.slug))
      .limit(1);
    if (existing) return reply.code(409).send({ error: "A page with that slug already exists." });

    const [row] = await db
      .insert(landingPages)
      .values({ ...data, createdBy: clerkId })
      .returning();
    return reply.code(201).send(await toAdminDto(row!));
  });

  app.patch<{ Params: { id: string } }>("/admin/landing/:id", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const parsed = updateLandingSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid page." });
    }
    const [current] = await db
      .select()
      .from(landingPages)
      .where(eq(landingPages.id, req.params.id))
      .limit(1);
    if (!current) return reply.code(404).send({ error: "Not found." });

    const patch = parsed.data;
    if (patch.slug && patch.slug !== current.slug) {
      const [clash] = await db
        .select({ id: landingPages.id })
        .from(landingPages)
        .where(eq(landingPages.slug, patch.slug))
        .limit(1);
      if (clash) return reply.code(409).send({ error: "A page with that slug already exists." });
    }

    // Keep the crawler snapshot fresh when a published page's content changes.
    const merged = { ...current, ...patch };
    const renderedHtml =
      current.status === "published"
        ? renderBlocksToHtml(merged.title, merged.blocks, merged.faq)
        : current.renderedHtml;

    const [row] = await db
      .update(landingPages)
      .set({ ...patch, renderedHtml, updatedAt: new Date() })
      .where(eq(landingPages.id, req.params.id))
      .returning();
    return reply.send(await toAdminDto(row!));
  });

  app.post<{ Params: { id: string } }>("/admin/landing/:id/publish", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const [row] = await db.select().from(landingPages).where(eq(landingPages.id, req.params.id)).limit(1);
    if (!row) return reply.code(404).send({ error: "Not found." });
    const [updated] = await db
      .update(landingPages)
      .set({
        status: "published",
        renderedHtml: renderBlocksToHtml(row.title, row.blocks, row.faq),
        publishedAt: row.publishedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(landingPages.id, req.params.id))
      .returning();
    return reply.send(await toAdminDto(updated!));
  });

  app.post<{ Params: { id: string } }>("/admin/landing/:id/unpublish", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const [updated] = await db
      .update(landingPages)
      .set({ status: "draft", updatedAt: new Date() })
      .where(eq(landingPages.id, req.params.id))
      .returning();
    if (!updated) return reply.code(404).send({ error: "Not found." });
    return reply.send(await toAdminDto(updated));
  });

  app.delete<{ Params: { id: string } }>("/admin/landing/:id", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    await db.delete(landingPages).where(eq(landingPages.id, req.params.id));
    return reply.send({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Per-page acquisition funnel: visits → free songs → registrations →
  // registered songs → upgrades (by plan). Attribution keyed by the
  // first-touch landing slug stamped on songs/users + the visited events.
  // -------------------------------------------------------------------------
  app.get("/admin/landing/analytics", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;

    const pages = await db
      .select({
        slug: landingPages.slug,
        title: landingPages.title,
        category: landingPages.category,
        status: landingPages.status,
      })
      .from(landingPages)
      .orderBy(desc(landingPages.updatedAt));

    const [visitRows, songRows, regRows, upgradeRows] = await Promise.all([
      db
        .select({
          slug: sql<string>`${analyticsEvents.props}->>'landingSlug'`,
          visits: sql<number>`count(distinct ${analyticsEvents.ownerHash})`,
        })
        .from(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.stage, "visited"),
            sql`${analyticsEvents.props}->>'landingSlug' is not null`,
          ),
        )
        .groupBy(sql`${analyticsEvents.props}->>'landingSlug'`),
      db
        .select({
          slug: songs.acquisitionLandingSlug,
          free: sql<number>`count(*) filter (where ${songs.userId} is null)`,
          registered: sql<number>`count(*) filter (where ${songs.userId} is not null)`,
        })
        .from(songs)
        .where(isNotNull(songs.acquisitionLandingSlug))
        .groupBy(songs.acquisitionLandingSlug),
      db
        .select({ slug: users.acquisitionLandingSlug, regs: sql<number>`count(*)` })
        .from(users)
        .where(isNotNull(users.acquisitionLandingSlug))
        .groupBy(users.acquisitionLandingSlug),
      db
        .select({ slug: users.acquisitionLandingSlug, plan: users.plan, c: sql<number>`count(*)` })
        .from(users)
        .where(and(isNotNull(users.acquisitionLandingSlug), ne(users.plan, "free")))
        .groupBy(users.acquisitionLandingSlug, users.plan),
    ]);

    const visits = new Map(visitRows.map((r) => [r.slug, n(r.visits)]));
    const songMap = new Map(songRows.map((r) => [r.slug, { free: n(r.free), reg: n(r.registered) }]));
    const regs = new Map(regRows.map((r) => [r.slug, n(r.regs)]));
    const upgrades = new Map<string, Record<string, number>>();
    for (const r of upgradeRows) {
      if (!r.slug) continue;
      const byPlan = upgrades.get(r.slug) ?? {};
      byPlan[r.plan] = n(r.c);
      upgrades.set(r.slug, byPlan);
    }

    const out: LandingFunnel[] = pages.map((p) => ({
      slug: p.slug,
      title: p.title,
      category: p.category,
      status: p.status,
      visits: visits.get(p.slug) ?? 0,
      freeSongs: songMap.get(p.slug)?.free ?? 0,
      registrations: regs.get(p.slug) ?? 0,
      registeredSongs: songMap.get(p.slug)?.reg ?? 0,
      upgradesByPlan: upgrades.get(p.slug) ?? {},
    }));
    return reply.send(out);
  });
}
