import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { landingPages, songs } from "../db/schema.js";
import { env } from "../env.js";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function seoRoutes(app: FastifyInstance) {
  // XML sitemap of indexable pages: the home page + every public, ready song's
  // public page. Served on the API host; the SEO worker proxies it to
  // <site>/sitemap.xml (the URL declared in robots.txt).
  app.get("/sitemap.xml", async (_req, reply) => {
    const base = env.APP_URL.replace(/\/$/, "");
    const [songRows, landingRows] = await Promise.all([
      db
        .select({ id: songs.id, updatedAt: songs.updatedAt })
        .from(songs)
        .where(and(eq(songs.isPublic, true), eq(songs.status, "ready")))
        .orderBy(desc(songs.updatedAt))
        .limit(50000),
      db
        .select({ slug: landingPages.slug, updatedAt: landingPages.updatedAt })
        .from(landingPages)
        .where(and(eq(landingPages.status, "published"), eq(landingPages.noindex, false)))
        .orderBy(desc(landingPages.updatedAt))
        .limit(50000),
    ]);

    const entries = [
      { loc: `${base}/`, lastmod: null as string | null },
      ...landingRows.map((r) => ({
        loc: `${base}/${r.slug}`,
        lastmod: r.updatedAt?.toISOString() ?? null,
      })),
      ...songRows.map((r) => ({ loc: `${base}/p/${r.id}`, lastmod: r.updatedAt?.toISOString() ?? null })),
    ];

    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      entries
        .map(
          (e) =>
            `  <url><loc>${xmlEscape(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`,
        )
        .join("\n") +
      `\n</urlset>\n`;

    return reply
      .header("content-type", "application/xml; charset=utf-8")
      .header("cache-control", "public, max-age=300")
      .send(body);
  });

  // robots.txt — allow all, point crawlers at the sitemap (the SEO worker
  // proxies both to the site root).
  app.get("/robots.txt", async (_req, reply) => {
    const base = env.APP_URL.replace(/\/$/, "");
    const body = `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`;
    return reply
      .header("content-type", "text/plain; charset=utf-8")
      .header("cache-control", "public, max-age=3600")
      .send(body);
  });
}
