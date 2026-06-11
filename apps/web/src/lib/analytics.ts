import posthog from "posthog-js";

/** Client-side PostHog. Captures VIEW/INTENT moments only — anything touching
 *  money or the pipeline is captured server-side (apps/api/src/lib/posthog.ts),
 *  and the two sides never share an event name. No key = everything no-ops
 *  (local dev, preview builds).
 *
 *  Env: VITE_POSTHOG_KEY (public project key), VITE_POSTHOG_HOST (optional). */

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";

let initialized = false;

export function initAnalytics(): void {
  if (!KEY || initialized) return;
  initialized = true;
  posthog.init(KEY, {
    api_host: HOST,
    // SPA: count history.pushState navigations as pageviews.
    capture_pageview: "history_change",
    capture_pageleave: true,
    autocapture: true,
    // Replay is invaluable for watching the first ad-driven users; paid traffic
    // is geo-targeted US/CA/AU/NZ. Revisit with a CMP before courting EU traffic.
    session_recording: { maskAllInputs: true },
    persistence: "localStorage+cookie",
  });
}

export function captureClient(event: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // analytics must never break the app
  }
}

/** Tie this browser to the signed-in person. Uses the same distinct-id scheme
 *  as the server (`clerk:{clerkUserId}`) so client + server events land on one
 *  PostHog person, with pre-signup anonymous activity merged in. */
export function identifyUser(clerkUserId: string, props?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    posthog.identify(`clerk:${clerkUserId}`, props);
  } catch {
    // ignore
  }
}

export function resetAnalyticsIdentity(): void {
  if (!initialized) return;
  try {
    posthog.reset();
  } catch {
    // ignore
  }
}
