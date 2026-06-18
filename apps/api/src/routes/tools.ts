import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ownerHash } from "../lib/hash.js";
import { matchStreamingLinks } from "../lib/music-links.js";
import { structureLyrics, summarizeSong } from "../lib/openrouter.js";
import { rateLimit, runMeteredTool } from "../lib/tool-metering.js";
import { demoVideoRequestSchema, resolveDemoStyle } from "@syllary/shared";
import { renderDemoSlideshow } from "../lib/demo-video.js";
import { presignGet } from "../lib/r2.js";
import { Sentry } from "../instrument.js";

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

  // One-shot demo lyric video — POST /api/tools/demo-video
  // Free + anonymous: renders the fixed sample clip as a Slideshow in the chosen
  // style + scene description. Hard-capped to 1 render per owner hash (each
  // render costs real image generation). The top-of-funnel "try a lyric video
  // without uploading or signing up" tool.
  app.post("/tools/demo-video", async (req, reply) => {
    const parsed = demoVideoRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Pick a style first." });
    }
    const style = resolveDemoStyle(parsed.data);
    if (!style) return reply.code(400).send({ error: "Pick a style or describe your own." });

    const hash = ownerHash(req.ip, req.headers["user-agent"] ?? "");
    // Per-visitor cap removed for now — keep only a loose backstop so a script
    // can't burn render spend in a tight loop.
    if (!rateLimit(`tool-demo-video:${hash}`, 30, 60 * 60 * 1000)) {
      return reply.code(429).send({ error: "Whoa — too many renders right now. Give it a minute." });
    }

    try {
      const key = await renderDemoSlideshow({
        style,
        description: parsed.data.description,
        ownerHash: hash,
      });
      return reply.send({ videoUrl: await presignGet(key) });
    } catch (err) {
      if ((err as Error).message === "DEMO_NOT_BUILT") {
        return reply.code(503).send({ error: "The demo sample isn't ready yet. Try again soon." });
      }
      req.log.error({ err }, "demo video render failed");
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { feature: "demo_video" },
      });
      return reply.code(502).send({ error: "Couldn't generate the demo video. Please try again." });
    }
  });
}
