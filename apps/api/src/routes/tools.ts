import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ownerHash } from "../lib/hash.js";
import { matchStreamingLinks } from "../lib/music-links.js";
import { structureLyrics, summarizeSong } from "../lib/openrouter.js";
import { rateLimit, runMeteredTool } from "../lib/tool-metering.js";

const SUMMARY_COST = 10;
const SECTIONS_COST = 10;

const textBodySchema = z.object({ text: z.string().min(1).max(20000) });

function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Standalone mini-tool endpoints that reuse the engine. Token-costing tools
 *  (summary, sections, cover) require sign-in and deduct credits via
 *  runMeteredTool; the zero-cost link finder is anonymous + rate-limited. */
export async function toolsRoutes(app: FastifyInstance) {
  // Song summary generator — POST /api/tools/summary { text }
  app.post("/tools/summary", async (req, reply) => {
    const parsed = textBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Paste some lyrics first." });
    const lines = toLines(parsed.data.text);
    if (lines.length === 0) return reply.code(400).send({ error: "Paste some lyrics first." });
    try {
      const out = await runMeteredTool(req, reply, {
        cost: SUMMARY_COST,
        run: async () => {
          const insights = await summarizeSong(lines);
          if (!insights) throw new Error("summary-failed");
          return insights;
        },
      });
      if (!out) return;
      return reply.send(out.result);
    } catch (err) {
      req.log.error({ err }, "tool summary failed");
      return reply.code(502).send({ error: "Couldn't summarize these lyrics. Try again." });
    }
  });

  // Find the chorus / section labels — POST /api/tools/sections { text }
  app.post("/tools/sections", async (req, reply) => {
    const parsed = textBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Paste some lyrics first." });
    const lines = toLines(parsed.data.text);
    if (lines.length === 0) return reply.code(400).send({ error: "Paste some lyrics first." });
    try {
      const out = await runMeteredTool(req, reply, {
        cost: SECTIONS_COST,
        run: async () => {
          const structured = await structureLyrics(lines);
          if (!structured) throw new Error("sections-failed");
          return structured;
        },
      });
      if (!out) return;
      return reply.send(out.result);
    } catch (err) {
      req.log.error({ err }, "tool sections failed");
      return reply.code(502).send({ error: "Couldn't analyze these lyrics. Try again." });
    }
  });

  // Streaming-link finder — GET /api/tools/links?title=&artist=&url=
  // Free + anonymous (no token cost), lightly rate-limited per owner hash.
  app.get("/tools/links", async (req, reply) => {
    const hash = ownerHash(req.ip, req.headers["user-agent"] ?? "");
    if (!rateLimit(`tool-links:${hash}`, 40, 60 * 60 * 1000)) {
      return reply.code(429).send({ error: "Too many lookups for now — try again later." });
    }
    const q = req.query as { title?: string; artist?: string; url?: string };
    const title = (q.title ?? "").toString();
    const artist = (q.artist ?? "").toString();
    const url = (q.url ?? "").toString();
    if (!title.trim() && !artist.trim() && !url.trim()) {
      return reply.code(400).send({ error: "Enter a song name, artist, or a streaming link." });
    }
    return reply.send(await matchStreamingLinks({ title, artist, url }));
  });
}
