import "./load-env.js";
import { Sentry } from "./instrument.js";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { env } from "./env.js";
import { startEmailDrip } from "./lib/email-drip.js";
import { shutdownPosthog } from "./lib/posthog.js";
import { billingRoutes } from "./routes/billing.js";
import { catalogRoutes } from "./routes/catalog.js";
import { contactRoutes } from "./routes/contact.js";
import { conversionsRoutes } from "./routes/conversions.js";
import { emailRoutes } from "./routes/email.js";
import { landingRoutes } from "./routes/landing.js";
import { memberRoutes } from "./routes/members.js";
import { seoRoutes } from "./routes/seo.js";
import { songsRoutes } from "./routes/songs.js";
import { toolsRoutes } from "./routes/tools.js";
import { trackRoutes } from "./routes/track.js";
import { uploadsRoutes } from "./routes/uploads.js";
import { videoRoutes } from "./routes/video.js";
import { webhookRoutes } from "./routes/webhooks.js";

const app = Fastify({ logger: true, trustProxy: true });

// Report unhandled route errors to Sentry (no-op without a DSN).
if (env.SENTRY_DSN) Sentry.setupFastifyErrorHandler(app);

// Keep the raw body (Stripe webhook signature verification needs it) while still
// parsing JSON for normal routes.
app.addContentTypeParser(
  "application/json",
  { parseAs: "buffer" },
  (req, body, done) => {
    const buf = body as Buffer;
    req.rawBody = buf;
    const text = buf.toString("utf8");
    try {
      done(null, text.length ? JSON.parse(text) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  },
);

// Normalize the configured site origin so a stray trailing slash or newline in
// the env value can't break CORS, and allow both the apex and www variants.
const base = env.APP_URL.trim().replace(/\/+$/, "");
const host = base.replace(/^https?:\/\/(www\.)?/i, "");
const scheme = base.toLowerCase().startsWith("http://") ? "http://" : "https://";
const allowedOrigins = Array.from(
  new Set([base, `${scheme}${host}`, `${scheme}www.${host}`]),
);

await app.register(cors, {
  origin: allowedOrigins,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
});

app.get("/health", () => ({ ok: true }));

// Served at the API root (not under /api) so it's reachable at
// <api-host>/sitemap.xml; the SEO worker proxies it to <site>/sitemap.xml.
await app.register(seoRoutes);

await app.register(uploadsRoutes, { prefix: "/api" });
await app.register(songsRoutes, { prefix: "/api" });
await app.register(catalogRoutes, { prefix: "/api" });
await app.register(memberRoutes, { prefix: "/api" });
await app.register(videoRoutes, { prefix: "/api" });
await app.register(trackRoutes, { prefix: "/api" });
await app.register(toolsRoutes, { prefix: "/api" });
await app.register(landingRoutes, { prefix: "/api" });
await app.register(billingRoutes, { prefix: "/api" });
await app.register(webhookRoutes, { prefix: "/api" });
await app.register(conversionsRoutes, { prefix: "/api" });
await app.register(contactRoutes, { prefix: "/api" });
await app.register(emailRoutes, { prefix: "/api" });

// Onboarding drip poller (no-op without RESEND_API_KEY).
startEmailDrip();

// Flush queued analytics on shutdown (Render restarts on every deploy).
const shutdown = async () => {
  await shutdownPosthog();
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

await app.listen({ port: env.PORT, host: "0.0.0.0" });
app.log.info(
  { anonymousLimit: env.ANONYMOUS_DAILY_LIMIT, quotaMode: "lifetime-per-hash" },
  "syllary-api-ready",
);
