import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import type { BillingPeriod } from "@syllary/shared";
import { ApiError, startCheckout } from "@/lib/api";
import { authConfigured } from "@/lib/auth";
import { PLAN_TIERS, type PlanTier } from "@/lib/plans";
import { cn } from "@/lib/utils";

function PlanButton({ tier, period, featured }: { tier: PlanTier["id"]; period: BillingPeriod; featured?: boolean }) {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!isSignedIn) {
      navigate("/sign-up");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      window.location.href = await startCheckout(tier, period);
    } catch (err) {
      setLoading(false);
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className={cn(
          "mt-5 w-full rounded-full py-2.5 text-[13px] font-medium transition-transform hover:scale-[1.02] disabled:opacity-60",
          featured ? "bg-pulse text-white" : "bg-white/10 text-white hover:bg-white/[0.16]",
        )}
      >
        {loading ? "Redirecting…" : isSignedIn ? "Choose plan" : "Start free"}
      </button>
      {error && <p className="mt-2 text-[11px] text-pulse">{error}</p>}
    </>
  );
}

export function Pricing() {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");

  return (
    <section
      id="pricing"
      className="scroll-mt-20 bg-black px-6 py-20 text-center [perspective:1200px] sm:px-8 md:py-28"
    >
      <div className="mb-8">
        <p className="mb-3 text-[11px] uppercase tracking-[3px] text-pulse/70">Simple pricing</p>
        <h2 className="text-[clamp(1.9rem,4vw,36px)] font-medium tracking-[-1.2px] text-white">
          Start free. Scale when you ship.
        </h2>
      </div>

      <div className="mb-10 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 text-[12px]">
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

      <div className="js-pricing-grid mx-auto grid max-w-[680px] grid-cols-1 gap-3.5 sm:grid-cols-3">
        {PLAN_TIERS.map((tier) => (
          <div
            key={tier.id}
            className={cn(
              "js-price-card relative rounded-[16px] p-6 text-left transition-transform duration-300 hover:-translate-y-1",
              tier.featured
                ? "-translate-y-3 border-[1.5px] border-pulse bg-[linear-gradient(180deg,#1a0a0a_0%,#0a0303_100%)] shadow-[0_8px_32px_rgba(255,45,45,0.15)] hover:-translate-y-4"
                : "border-[0.5px] border-white/[0.08] bg-[linear-gradient(180deg,#161616_0%,#0a0a0a_100%)]",
            )}
          >
            {tier.featured && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-pulse px-3 py-1 text-[10px] font-medium uppercase tracking-[0.8px] text-white">
                Most popular
              </span>
            )}
            <div className="text-[14px] font-medium text-white">{tier.name}</div>
            <div className="mb-[18px] text-[11px] text-white/40">{tier.desc}</div>
            <div className="text-[32px] font-medium tracking-[-1.2px] text-white">
              ${period === "monthly" ? tier.monthly : tier.annual}
              <span className="text-[13px] font-normal text-white/40">
                /{period === "monthly" ? "mo" : "yr"}
              </span>
            </div>
            <ul className="mt-4 space-y-1 text-[11px] leading-[1.6] text-white/50">
              {tier.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            {authConfigured ? (
              <PlanButton tier={tier.id} period={period} featured={tier.featured} />
            ) : (
              <a
                href="#upload"
                className={cn(
                  "mt-5 block w-full rounded-full py-2.5 text-center text-[13px] font-medium transition-transform hover:scale-[1.02]",
                  tier.featured ? "bg-pulse text-white" : "bg-white/10 text-white hover:bg-white/[0.16]",
                )}
              >
                Start free
              </a>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 text-[12px] text-white/30">
        Annual plans save 2 months. Free tier: 3 songs to start, no credit card.
      </p>
    </section>
  );
}
