// Sentry must initialize before anything else is imported so its hooks can
// instrument http/db modules. Imported first by index.ts (right after load-env,
// which populates process.env). No DSN = Sentry never starts (local dev).
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.RENDER_GIT_COMMIT ?? undefined,
    // Errors are the point; keep performance tracing off until there's a reason
    // to pay its overhead on a single small instance.
    tracesSampleRate: 0,
  });
}

export { Sentry };
