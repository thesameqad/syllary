import type { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { conversionExports } from "../db/schema.js";
import { env } from "../env.js";
import { requireAdmin } from "../lib/admin.js";

/** Format a timestamp the way both Google Ads ("Conversions from clicks"
 *  import) and Microsoft Advertising (offline conversions) accept:
 *  "yyyy-MM-dd HH:mm:ss+0000". */
function conversionTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+0000`
  );
}

type ConversionRow = {
  clickId: string;
  conversionName: string;
  conversionAt: Date;
  valueCents: number;
  currency: string;
};

/** Build the offline-conversion CSV body for an ad network. Conversion name must
 *  match the conversion action created in the Ads UI ("purchase" / "sign_up"). */
function buildCsv(source: "google" | "microsoft", rows: ConversionRow[]): string {
  const header =
    source === "google"
      ? "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency"
      : "Microsoft Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency";
  const lines = rows.map((r) =>
    [
      r.clickId,
      r.conversionName,
      conversionTime(r.conversionAt),
      (r.valueCents / 100).toFixed(2),
      r.currency.toUpperCase(),
    ].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

/** Constant-time comparison against the configured export token. */
function tokenOk(provided: string | undefined): boolean {
  const expected = env.CONVERSIONS_EXPORT_TOKEN;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function conversionsRoutes(app: FastifyInstance) {
  // Admin-authenticated incremental export. The founder downloads one CSV per
  // network and uploads it in the Ads UI; rows are stamped exportedAt on
  // download so the next pull only contains new conversions
  // (?includeExported=true re-downloads everything for recovery).
  app.get<{ Querystring: { source?: string; includeExported?: string } }>(
    "/admin/conversions/export.csv",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;

      const source = req.query.source === "microsoft" ? "microsoft" : "google";
      const includeExported = req.query.includeExported === "true";

      const rows = await db
        .select()
        .from(conversionExports)
        .where(
          includeExported
            ? eq(conversionExports.source, source)
            : and(eq(conversionExports.source, source), isNull(conversionExports.exportedAt)),
        )
        .orderBy(asc(conversionExports.conversionAt));

      if (!includeExported && rows.length > 0) {
        const now = new Date();
        for (const r of rows) {
          await db
            .update(conversionExports)
            .set({ exportedAt: now })
            .where(eq(conversionExports.id, r.id));
        }
      }

      reply
        .header("content-type", "text/csv; charset=utf-8")
        .header(
          "content-disposition",
          `attachment; filename="syllary-conversions-${source}.csv"`,
        );
      return reply.send(buildCsv(source, rows));
    },
  );

  // Token-authenticated rolling export — usable in a browser and by Google Ads /
  // Microsoft "scheduled uploads" (their fetcher can't do Clerk auth). The token
  // rides the query string over HTTPS; set CONVERSIONS_EXPORT_TOKEN to a long
  // random secret (unset = disabled, 404). Serves a rolling window and does NOT
  // mark rows exported, so repeated scheduled pulls are idempotent: the ad
  // action's count=one dedups re-sent conversions, and rows older than the
  // import window are useless to upload anyway.
  app.get<{ Querystring: { source?: string; token?: string; days?: string } }>(
    "/conversions/export.csv",
    async (req, reply) => {
      if (!env.CONVERSIONS_EXPORT_TOKEN) return reply.code(404).send({ error: "Not found." });
      if (!tokenOk(req.query.token)) return reply.code(403).send({ error: "Forbidden." });

      const source = req.query.source === "microsoft" ? "microsoft" : "google";
      const days = Math.min(Math.max(Number(req.query.days) || 90, 1), 90);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const rows = await db
        .select()
        .from(conversionExports)
        .where(
          and(eq(conversionExports.source, source), gte(conversionExports.conversionAt, since)),
        )
        .orderBy(asc(conversionExports.conversionAt));

      reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("cache-control", "no-store")
        .header(
          "content-disposition",
          `attachment; filename="syllary-conversions-${source}.csv"`,
        );
      return reply.send(buildCsv(source, rows));
    },
  );
}
