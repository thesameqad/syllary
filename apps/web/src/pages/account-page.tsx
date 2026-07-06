import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { SignedIn, SignedOut, UserButton, useUser } from "@clerk/clerk-react";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import type { Account, BillingPeriod } from "@syllary/shared";
import { ApiError, changePlan, getAccount, openBillingPortal, startCheckout } from "@/lib/api";
import { authConfigured } from "@/lib/auth";
import { reportPurchaseConversion, setAdUserData } from "@/lib/ad-tags";
import { LYRICS_TIERS, planPriceUsd, PLAN_LABEL, type PlanTier, VIDEO_TIERS } from "@/lib/plans";
import { LogoWordmark } from "@/components/logo";
import { cn } from "@/lib/utils";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-void text-white">
      <header className="border-b border-white/[0.04]">
        <div className="mx-auto flex max-w-[860px] items-center justify-between px-6 py-4">
          <Link to="/" aria-label="Syllary home">
            <LogoWordmark />
          </Link>
          {authConfigured && <UserButton afterSignOutUrl="/" />}
        </div>
      </header>
      <div className="mx-auto max-w-[860px] px-6 py-10">{children}</div>
    </main>
  );
}

function PlanCard({
  tier,
  period,
  account,
  onError,
}: {
  tier: PlanTier;
  period: BillingPeriod;
  account: Account;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const isCurrent = account.plan === tier.id;
  const price = period === "monthly" ? tier.monthly : tier.annual;

  async function act() {
    setBusy(true);
    onError("");
    try {
      // Existing subscribers go straight to a Stripe confirm screen for this
      // specific plan (proration handled); free users start a fresh checkout.
      const url = account.hasSubscription
        ? await changePlan(tier.id, period)
        : await startCheckout(tier.id, period);
      window.location.href = url;
    } catch (e) {
      setBusy(false);
      onError(e instanceof ApiError ? e.message : "Something went wrong.");
    }
  }

  return (
    <div
      className={cn(
        "rounded-[16px] border p-5 text-left",
        isCurrent
          ? "border-pulse/60 bg-pulse/[0.06]"
          : tier.featured
            ? "border-pulse/40 bg-[linear-gradient(180deg,#1a0a0a_0%,#0a0303_100%)]"
            : "border-white/[0.08] bg-stage/50",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-medium">{tier.name}</span>
        {isCurrent && (
          <span className="text-[10px] uppercase tracking-[1.5px] text-pulse">Current</span>
        )}
      </div>
      <div className="mt-2 text-[26px] font-medium tracking-[-1px]">
        ${price}
        <span className="text-[12px] font-normal text-white/40">
          /{period === "monthly" ? "mo" : "yr"}
        </span>
      </div>
      <ul className="mt-3 space-y-1 text-[11px] leading-[1.6] text-white/50">
        {tier.features.map((f) => (
          <li key={f.text} className="flex items-center gap-1.5">
            <Check
              className={cn("h-3 w-3 shrink-0", f.comingSoon ? "text-white/30" : "text-success")}
            />
            <span className={cn(f.comingSoon && "text-white/35")}>{f.text}</span>
            {f.comingSoon && (
              <span className="shrink-0 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.6px] text-white/55">
                Soon
              </span>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={act}
        disabled={busy || isCurrent}
        className={cn(
          "mt-4 w-full rounded-full py-2.5 text-[13px] font-medium transition-transform hover:scale-[1.02] disabled:cursor-default disabled:opacity-60 disabled:hover:scale-100",
          isCurrent
            ? "border border-white/15 bg-transparent text-white/60"
            : tier.featured
              ? "bg-pulse text-white"
              : "bg-white/10 text-white hover:bg-white/[0.16]",
        )}
      >
        {isCurrent
          ? "Current plan"
          : busy
            ? "Redirecting…"
            : account.hasSubscription
              ? "Switch"
              : "Choose"}
      </button>
    </div>
  );
}

function AccountInner() {
  const { user } = useUser();
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");

  useEffect(() => {
    getAccount()
      .then(setAccount)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load your account."));
  }, []);

  // Fire the purchase conversion when Stripe returns the buyer here. Guarded by
  // the Checkout session id so a refresh/bookmark can't double-count, then the
  // query params are stripped from the URL.
  useEffect(() => {
    if (!account) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;
    const sessionId = params.get("session_id") ?? undefined;
    const firedKey = `purchase_fired:${sessionId ?? "nosession"}`;
    if (!sessionStorage.getItem(firedKey)) {
      sessionStorage.setItem(firedKey, "1");
      // Enhanced conversions: the buyer's email must be staged before the
      // conversion event so Google/Microsoft can match cookieless purchases.
      setAdUserData(user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress);
      // Annual subscriptions renew ~a year out; use that to pick the right price.
      const period: BillingPeriod =
        account.currentPeriodEnd &&
        new Date(account.currentPeriodEnd).getTime() - Date.now() > 180 * 24 * 60 * 60 * 1000
          ? "annual"
          : "monthly";
      reportPurchaseConversion({ valueUsd: planPriceUsd(account.plan, period), transactionId: sessionId });
    }
    window.history.replaceState({}, "", "/account");
    // `user` is intentionally not a dependency: the conversion must fire as soon
    // as the account loads, with the email as best-effort (AnalyticsBridge has
    // usually staged it already; Clerk resolving later can't re-fire past the
    // sessionStorage guard anyway).
  }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  async function manage() {
    setBusy(true);
    try {
      window.location.href = await openBillingPortal();
    } catch (e) {
      setBusy(false);
      setError(e instanceof ApiError ? e.message : "Could not open the billing portal.");
    }
  }

  if (error && !account) return <p className="text-[14px] text-pulse">{error}</p>;
  if (!account)
    return (
      <div className="flex items-center gap-2 text-white/50">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );

  const usage =
    account.monthlyQuota == null
      ? `${account.songsLifetime} of 3 free songs used`
      : `${account.songsThisPeriod} of ${account.monthlyQuota} songs used this cycle`;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-[26px] font-medium tracking-[-0.8px]">Subscription</h1>
        <p className="mt-1 text-[13px] text-white/40">Manage your plan and usage.</p>
      </div>

      <div className="rounded-[16px] border-[0.5px] border-white/[0.08] bg-stage/50 p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[12px] uppercase tracking-[1.5px] text-white/40">Current plan</div>
            <div className="mt-1 text-[20px] font-medium">{PLAN_LABEL[account.plan]}</div>
          </div>
          {account.hasSubscription && (
            <button
              type="button"
              onClick={manage}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-white/[0.06] disabled:opacity-60"
            >
              {busy ? "Opening…" : "Manage"}
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="mt-5 border-t border-white/[0.06] pt-5 text-[13px] text-white/60">
          {usage}
          {account.currentPeriodEnd && (
            <> · renews {new Date(account.currentPeriodEnd).toLocaleDateString()}</>
          )}
        </div>
      </div>

      <div>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[15px] font-medium">
            {account.plan === "free" ? "Choose a plan" : "Change plan"}
          </h2>
          <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 text-[12px]">
            {(["monthly", "annual"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded-full px-3 py-1 font-medium capitalize transition-colors",
                  period === p ? "bg-white text-[#0a0a0a]" : "text-white/55 hover:text-white",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-8">
          {(
            [
              { label: "Lyrics plans", tiers: LYRICS_TIERS },
              { label: "Music-video plans", tiers: VIDEO_TIERS },
            ] as const
          ).map((group) => (
            <div key={group.label}>
              <p className="mb-3 text-[11px] uppercase tracking-[1.5px] text-white/35">
                {group.label}
              </p>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                {group.tiers.map((tier) => (
                  <PlanCard
                    key={tier.id}
                    tier={tier}
                    period={period}
                    account={account}
                    onError={(m) => setError(m || null)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        {error && <p className="mt-3 text-[12px] text-pulse">{error}</p>}
      </div>

      <Link
        to="/"
        className="inline-block text-[13px] text-white/50 transition-colors hover:text-white"
      >
        ← Back to Syllary
      </Link>
    </div>
  );
}

export function AccountPage() {
  if (!authConfigured) {
    return (
      <Shell>
        <p className="text-[14px] text-white/60">Authentication isn&apos;t configured yet.</p>
      </Shell>
    );
  }
  return (
    <>
      <SignedOut>
        <Navigate to="/sign-in" replace />
      </SignedOut>
      <SignedIn>
        <Shell>
          <AccountInner />
        </Shell>
      </SignedIn>
    </>
  );
}
