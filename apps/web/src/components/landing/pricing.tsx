import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { PLAN_CREDITS, type BillingPeriod } from "@syllary/shared";
import { ApiError, startCheckout } from "@/lib/api";
import { authConfigured } from "@/lib/auth";
import { bonusTokens, firstMonthTokens, LYRICS_TIERS, type PlanTier, VIDEO_TIERS } from "@/lib/plans";
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

function PlanCard({ tier, period }: { tier: PlanTier; period: BillingPeriod }) {
  return (
    <div
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
        <span className="text-[13px] font-normal text-white/40">/{period === "monthly" ? "mo" : "yr"}</span>
      </div>
      <div className="mt-2 text-[12px] text-white/60">
        {PLAN_CREDITS[tier.id].toLocaleString()} tokens / month
      </div>
      {bonusTokens(tier.id) > 0 && (
        <>
          <div className="mt-2 rounded-[10px] border border-pulse/50 bg-pulse/[0.12] px-3 py-2">
            <div className="text-[15px] font-medium tracking-[-0.3px] text-pulse">
              🎁 +{bonusTokens(tier.id).toLocaleString()} sign-up bonus
            </div>
            <div className="mt-0.5 text-[10px] leading-snug text-white/55">
              one-time · applied instantly at checkout
            </div>
          </div>
          <div className="mt-1.5 text-[11px] text-white/45">
            = {firstMonthTokens(tier.id).toLocaleString()} tokens your first month
          </div>
        </>
      )}
      <ul className="mt-4 space-y-1 text-[11px] leading-[1.6] text-white/50">
        {tier.features.map((feature) => (
          <li key={feature.text} className="flex items-baseline gap-1.5">
            <span className={cn(feature.comingSoon && "text-white/35")}>{feature.text}</span>
            {feature.comingSoon && (
              <span className="shrink-0 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.6px] text-white/55">
                Soon
              </span>
            )}
          </li>
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
  );
}

function PlanGroup({
  eyebrow,
  title,
  blurb,
  tiers,
  period,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  tiers: PlanTier[];
  period: BillingPeriod;
}) {
  return (
    <div>
      <div className="mb-6">
        <p className="mb-2 text-[11px] uppercase tracking-[2px] text-pulse/70">{eyebrow}</p>
        <h3 className="text-[clamp(1.3rem,2.6vw,24px)] font-medium tracking-[-0.8px] text-white">{title}</h3>
        <p className="mt-1.5 text-[12px] text-white/40">{blurb}</p>
      </div>
      <div className="js-pricing-grid mx-auto grid max-w-[680px] grid-cols-1 gap-3.5 sm:grid-cols-3">
        {tiers.map((tier) => (
          <PlanCard key={tier.id} tier={tier} period={period} />
        ))}
      </div>
    </div>
  );
}

/** Token grants translated into things a musician can count. Derived from the
 *  real cost functions (creditCost / estimateVideoCost in @syllary/shared) for
 *  a typical 3:30 song at default settings: pro-mode lyrics ≈ 500 tokens;
 *  full videos ≈ 15.7k (Slideshow) / 82k (Living Scenes) / 69k (Cinematic).
 *  Songs/videos shown are per month (Free is a one-time grant). */
const PLAN_VALUE_ROWS: {
  plan: string;
  tokens: string;
  songs: string;
  slideshow: string;
  living: string;
  cinematic: string;
}[] = [
  { plan: "Free", tokens: "1,000 once", songs: "≈2", slideshow: "previews", living: "—", cinematic: "—" },
  { plan: "Starter", tokens: "5,000", songs: "≈10", slideshow: "previews", living: "—", cinematic: "—" },
  { plan: "Creator", tokens: "15,000", songs: "≈30", slideshow: "≈1", living: "—", cinematic: "—" },
  { plan: "Pro", tokens: "60,000", songs: "≈120", slideshow: "≈3", living: "—", cinematic: "—" },
  { plan: "Reel", tokens: "80,000", songs: "≈160", slideshow: "≈5", living: "0–1", cinematic: "≈1" },
  { plan: "Studio", tokens: "220,000", songs: "≈440", slideshow: "≈14", living: "≈2", cinematic: "≈3" },
  { plan: "Premiere", tokens: "620,000", songs: "≈1,240", slideshow: "≈39", living: "≈7", cinematic: "≈8" },
];

/** Tokens are opaque at the moment of purchase — this answers "how many songs
 *  and videos is that?" in one glance. */
function PlanValueTable() {
  return (
    <div className="mx-auto mt-16 max-w-[760px] text-left">
      <h3 className="mb-1 text-center text-[17px] font-medium tracking-[-0.4px] text-white">
        What your plan buys
      </h3>
      <p className="mb-5 text-center text-[12px] text-white/40">
        For a typical 3:30 song at default settings — the exact token price is always shown
        before you confirm.
      </p>
      <div className="overflow-x-auto rounded-[14px] border-[0.5px] border-white/[0.08] bg-white/[0.02]">
        <table className="w-full min-w-[560px] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-white/[0.08] text-left text-[11px] uppercase tracking-[1px] text-white/40">
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Tokens / mo</th>
              <th className="px-4 py-3 font-medium">Synced-lyric songs</th>
              <th className="px-4 py-3 font-medium">Slideshow videos</th>
              <th className="px-4 py-3 font-medium">Living Scenes</th>
              <th className="px-4 py-3 font-medium">Cinematic</th>
            </tr>
          </thead>
          <tbody>
            {PLAN_VALUE_ROWS.map((r) => (
              <tr key={r.plan} className="border-b border-white/[0.04] last:border-0">
                <td className="px-4 py-2.5 font-medium text-white">{r.plan}</td>
                <td className="px-4 py-2.5 text-white/60">{r.tokens}</td>
                <td className="px-4 py-2.5 text-white/60">{r.songs}</td>
                <td className="px-4 py-2.5 text-white/60">{r.slideshow}</td>
                <td className="px-4 py-2.5 text-white/60">{r.living}</td>
                <td className="px-4 py-2.5 text-white/60">{r.cinematic}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-center text-[11px] text-white/30">
        Mix freely — tokens are one wallet. Longer songs cost proportionally more; shorter ones
        less.
      </p>
    </div>
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

      <div className="mb-12 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 text-[12px]">
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

      <div className="mx-auto max-w-[760px] space-y-16">
        <PlanGroup
          eyebrow="Lyric files"
          title="Lyrics plans"
          blurb="Synced lyric files in every format — for shipping releases to the platforms."
          tiers={LYRICS_TIERS}
          period={period}
        />
        <PlanGroup
          eyebrow="Music videos"
          title="Music-video plans"
          blurb="Video generation isn't cheap — a typical lyrics plan's tokens run out fast. If you plan to make music videos, we strongly recommend one of the plans below."
          tiers={VIDEO_TIERS}
          period={period}
        />
      </div>

      <PlanValueTable />

      <p className="mt-10 text-[12px] text-white/30">
        Annual plans save 2 months. Free tier: 3 songs to start, no credit card.
      </p>
    </section>
  );
}
