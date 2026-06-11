import type { FastifyInstance } from "fastify";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { conversionExports } from "../db/schema.js";
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

/** Weekly offline-conversion export for the ad platforms. The founder downloads
 *  one CSV per network and uploads it in the Ads UI; rows are stamped
 *  exportedAt on download so the next pull only contains new conversions
 *  (?includeExported=true re-downloads everything for recovery). */
export async function conversionsRoutes(app: FastifyInstance) {
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

      // Header rows per platform template. Conversion name must match the
      // conversion action created in the Ads UI ("purchase").
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
      return reply.send([header, ...lines].join("\n") + "\n");
    },
  );
}
