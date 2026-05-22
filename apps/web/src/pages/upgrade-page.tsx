import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { Account, BillingPeriod } from "@syllary/shared";
import { ApiError, getAccount, openBillingPortal, startCheckout } from "@/lib/api";
import { PLAN_LABEL, PLAN_ORDER, PLAN_TIERS } from "@/lib/plans";
import { cn } from "@/lib/utils";

export function UpgradePage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAccount().then(setAccount).catch(() => setError("Could not load your plan."));
  }, []);

  if (!account) {
    return (
      <div className="flex items-center gap-2 text-white/50">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const higher = PLAN_TIERS.filter((t) => PLAN_ORDER[t.id] > PLAN_ORDER[account.plan]);

  async function choose(tierId: "starter" | "creator" | "pro") {
    setBusy(tierId);
    setError(null);
    try {
      // Existing subscribers change plans via the Stripe portal (proration);
      // free users start a fresh checkout.
      const url = account!.hasSubscription
        ? await openBillingPortal()
        : await startCheckout(tierId, period);
      window.location.href = url;
    } catch (e) {
      setBusy(null);
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    }
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-[24px] font-medium tracking-[-0.6px]">Upgrade your plan</h1>
        <span className="rounded-full border border-white/10 px-3 py-1 text-[12px] text-white/55">
          Current: {PLAN_LABEL[account.plan]}
        </span>
      </div>
      <p className="mb-8 text-[13px] text-white/40">Move up any time — more songs, more tokens.</p>

      {error && <p className="mb-4 text-[13px] text-pulse">{error}</p>}

      {higher.length === 0 ? (
        <div className="rounded-[16px] border border-white/[0.08] bg-stage/50 p-8 text-center">
          <p className="text-[15px] font-medium text-white">You&apos;re on the top plan.</p>
          <p className="mt-1 text-[13px] text-white/40">Thanks for going Pro.</p>
        </div>
      ) : (
        <>
          <div className="mb-6 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 text-[12px]">
            {(["monthly", "annual"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded-full px-4 py-1.5 font-medium capitalize transition-colors",
                  period === p ? "bg-white text-[#0a0a0a]" : "text-white/55 hover:text-white",
                )}
              >
                {p}
                {p === "annual" && <span className="ml-1.5 text-pulse">−2 months</span>}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            {higher.map((tier) => (
              <div
                key={tier.id}
                className={cn(
                  "rounded-[16px] border p-6 text-left",
                  tier.featured
                    ? "border-pulse/40 bg-[linear-gradient(180deg,#1a0a0a_0%,#0a0303_100%)]"
                    : "border-white/[0.08] bg-stage/50",
                )}
              >
                <div className="text-[14px] font-medium text-white">{tier.name}</div>
                <div className="mb-[18px] text-[11px] text-white/40">{tier.desc}</div>
                <div className="text-[30px] font-medium tracking-[-1px] text-white">
                  ${period === "monthly" ? tier.monthly : tier.annual}
                  <span className="text-[12px] font-normal text-white/40">
                    /{period === "monthly" ? "mo" : "yr"}
                  </span>
                </div>
                <ul className="mt-4 space-y-1 text-[11px] leading-[1.6] text-white/50">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5">
                      <Check className="h-3 w-3 text-success" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => choose(tier.id)}
                  disabled={busy !== null}
                  className={cn(
                    "mt-5 w-full rounded-full py-2.5 text-[13px] font-medium transition-transform hover:scale-[1.02] disabled:opacity-60",
                    tier.featured ? "bg-pulse text-white" : "bg-white/10 text-white hover:bg-white/[0.16]",
                  )}
                >
                  {busy === tier.id ? "Redirecting…" : `Upgrade to ${tier.name}`}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
