import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider, useAuth, useUser } from "@clerk/clerk-react";
import { dark } from "@clerk/themes";
import * as Sentry from "@sentry/react";
import { App } from "./App";
import { initAdTags, reportSignupConversion, setAdUserData } from "@/lib/ad-tags";
import { identifyUser, initAnalytics } from "@/lib/analytics";
import { setTokenGetter } from "@/lib/api";
import { clerkPublishableKey } from "@/lib/auth";

// Error tracking — no DSN (local dev, previews) = never initializes.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({ dsn: sentryDsn, environment: import.meta.env.MODE, tracesSampleRate: 0 });
}

initAdTags();
initAnalytics();

function TokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setTokenGetter(() => getToken());
    return () => setTokenGetter(null);
  }, [getToken]);
  return null;
}

/** Ties the browser to the signed-in PostHog person, and reports a fresh
 *  sign-up to the ad platforms exactly once (sessionStorage de-dupes reloads;
 *  "fresh" = account created in the last few minutes). */
function AnalyticsBridge() {
  const { user } = useUser();
  // primaryEmailAddress can be null on the first render (or for some accounts);
  // fall back to the first address and keep `email` in the deps so we re-identify
  // once it resolves. The server sets the email too (authoritative) — this is the
  // best-effort client side, which an ad blocker may have stopped entirely.
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress;
  useEffect(() => {
    if (!user) return;
    setAdUserData(email);
    identifyUser(user.id, {
      ...(email ? { email } : {}),
      ...(user.fullName ? { name: user.fullName } : {}),
    });
    const created = user.createdAt ? Date.now() - user.createdAt.getTime() : Infinity;
    if (created < 5 * 60 * 1000 && !sessionStorage.getItem("syl_signup_reported")) {
      sessionStorage.setItem("syl_signup_reported", "1");
      reportSignupConversion();
    }
  }, [user, email]);
  return null;
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

const tree = (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

const appearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: "#FF2D2D",
    colorBackground: "#0f0f0f",
    colorInputBackground: "#161616",
    borderRadius: "0.75rem",
  },
};

createRoot(rootElement).render(
  <StrictMode>
    {clerkPublishableKey ? (
      <ClerkProvider
        publishableKey={clerkPublishableKey}
        appearance={appearance}
        afterSignOutUrl="/"
      >
        <TokenBridge />
        <AnalyticsBridge />
        {tree}
      </ClerkProvider>
    ) : (
      tree
    )}
  </StrictMode>,
);
