/** Paid-ads measurement tags (Google gtag + Microsoft UET), injected at runtime
 *  only when their env keys exist — local dev and preview builds stay clean.
 *  Purchases fire client-side on the Stripe success return page (/account?
 *  checkout=success), which lands back on our own domain — so gtag attributes
 *  them to the original ad click via its first-party cookie. gclid is still
 *  captured server-side as a backup (conversion_exports), but the website
 *  conversion is the live signal, so there's no weekly CSV upload to run.
 *
 *  Env:
 *    VITE_GTAG_ID                 e.g. "AW-123456789"
 *    VITE_GTAG_SIGNUP_LABEL       e.g. "AW-123456789/AbCdEfGh" (secondary)
 *    VITE_GTAG_PURCHASE_LABEL     e.g. "AW-123456789/IjKlMnOp" (primary)
 *    VITE_UET_TAG_ID              e.g. "12345678"
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    uetq?: unknown[];
  }
}

const GTAG_ID = import.meta.env.VITE_GTAG_ID as string | undefined;
const GTAG_SIGNUP_LABEL = import.meta.env.VITE_GTAG_SIGNUP_LABEL as string | undefined;
const GTAG_PURCHASE_LABEL = import.meta.env.VITE_GTAG_PURCHASE_LABEL as string | undefined;
const UET_TAG_ID = import.meta.env.VITE_UET_TAG_ID as string | undefined;

/** Inject the Google tag and Microsoft UET snippets. Call once at boot. */
export function initAdTags(): void {
  if (GTAG_ID) {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GTAG_ID)}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer ?? [];
    // gtag.js only executes commands pushed to dataLayer as the `arguments`
    // object (Google's canonical `function gtag(){dataLayer.push(arguments)}`).
    // A real array — e.g. from rest params — is left unprocessed, so `config`
    // and `conversion` never fire even though the script itself loads. Push
    // `arguments` verbatim.
    window.gtag = function () {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag("js", new Date());
    // Ads measurement only — no GA4 property. URL passthrough keeps the gclid
    // available on SPA navigations.
    window.gtag("config", GTAG_ID, { allow_enhanced_conversions: true });
  }

  if (UET_TAG_ID) {
    window.uetq = window.uetq ?? [];
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://bat.bing.com/bat.js";
    s.onload = () => {
      // UET boots from the global queue; pushing the create event is enough.
      const w = window as unknown as Record<string, unknown>;
      const UET = w.UET as (new (o: object) => { push: (...a: unknown[]) => void }) | undefined;
      if (!UET) return;
      const uet = new UET({ ti: UET_TAG_ID, q: window.uetq });
      w.uetq = uet;
      uet.push("pageLoad");
    };
    document.head.appendChild(s);
  }
}

let adUserEmail: string | null = null;

/** Provide the signed-in user's email for enhanced conversions. Google and
 *  Microsoft normalize + SHA-256 hash it client-side before sending; the raw
 *  address never leaves the tag. Call whenever the email becomes known — it's
 *  re-asserted right before each conversion event so ordering can't drop it. */
export function setAdUserData(email: string | null | undefined): void {
  if (!email || email === adUserEmail) return;
  adUserEmail = email;
  applyAdUserData();
}

function applyAdUserData(): void {
  if (!adUserEmail) return;
  try {
    if (window.gtag && GTAG_ID) window.gtag("set", "user_data", { email: adUserEmail });
    const uetq = window.uetq as { push?: (...a: unknown[]) => void } | unknown[] | undefined;
    if (uetq && "push" in (uetq as object)) {
      (uetq as { push: (...a: unknown[]) => void }).push("set", { pid: { em: adUserEmail } });
    }
  } catch {
    // measurement must never break the app
  }
}

/** Report a completed sign-up to both networks (secondary/bid-data conversion;
 *  the primary "purchase" conversion is imported server-side from Stripe). */
export function reportSignupConversion(): void {
  applyAdUserData();
  try {
    if (window.gtag) {
      if (GTAG_SIGNUP_LABEL) window.gtag("event", "conversion", { send_to: GTAG_SIGNUP_LABEL });
      else window.gtag("event", "sign_up");
    }
    const uetq = window.uetq as { push?: (...a: unknown[]) => void } | unknown[] | undefined;
    if (uetq && "push" in (uetq as object)) {
      (uetq as { push: (...a: unknown[]) => void }).push("event", "signup", {});
    }
  } catch {
    // measurement must never break the app
  }
}

/** Report a completed purchase — the PRIMARY conversion that drives bidding.
 *  Fired from the Stripe success page. `transactionId` (the Checkout session id)
 *  lets Google dedupe if the page is refreshed or bookmarked. */
export function reportPurchaseConversion(opts: { valueUsd: number | null; transactionId?: string }): void {
  applyAdUserData();
  try {
    if (window.gtag && GTAG_PURCHASE_LABEL) {
      const payload: Record<string, unknown> = { send_to: GTAG_PURCHASE_LABEL };
      if (opts.valueUsd != null) {
        payload.value = opts.valueUsd;
        payload.currency = "USD";
      }
      if (opts.transactionId) payload.transaction_id = opts.transactionId;
      window.gtag("event", "conversion", payload);
    }
    const uetq = window.uetq as { push?: (...a: unknown[]) => void } | unknown[] | undefined;
    if (uetq && "push" in (uetq as object)) {
      (uetq as { push: (...a: unknown[]) => void }).push("event", "purchase", {
        ...(opts.valueUsd != null ? { revenue_value: opts.valueUsd, currency: "USD" } : {}),
      });
    }
  } catch {
    // measurement must never break the app
  }
}
