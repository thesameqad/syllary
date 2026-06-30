import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { BillingPeriod } from "@syllary/shared";
import { ApiError, startCheckout } from "@/lib/api";
import { captureClient } from "@/lib/analytics";
import { type PlanTier, VIDEO_TIERS } from "@/lib/plans";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/** A single video plan's CTA — kicks off Stripe checkout. Fires `plan_selected`
 *  so the funnel can see the purchase intent (the modal redirects away on click,
 *  so this is the last client event before Stripe). */
function PlanButton({ tier, period, featured }: { tier: PlanTier["id"]; period: BillingPeriod; featured?: boolean }) {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    captureClient("plan_selected", { tier, period });
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
          "mt-5 flex w-full items-center justify-center gap-1.5 rounded-full py-2.5 text-[13px] font-medium transition-transform hover:scale-[1.02] disabled:opacity-60",
          featured ? "bg-pulse text-white" : "bg-white/10 text-white hover:bg-white/[0.16]",
        )}
      >
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {loading ? "Redirecting…" : "Choose plan"}
      </button>
      {error && <p className="mt-2 text-[11px] text-pulse">{error}</p>}
    </>
  );
}

function PlanCard({ tier, period }: { tier: PlanTier; period: BillingPeriod }) {
  return (
    <div
      className={cn(
        "relative rounded-[16px] p-5 text-left",
        tier.featured
          ? "border-[1.5px] border-pulse bg-[linear-gradient(180deg,#1a0a0a_0%,#0a0303_100%)]"
          : "border-[0.5px] border-white/[0.08] bg-[linear-gradient(180deg,#161616_0%,#0a0a0a_100%)]",
      )}
    >
      {tier.featured && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-pulse px-3 py-1 text-[10px] font-medium uppercase tracking-[0.8px] text-white">
          Most popular
        </span>
      )}
      <div className="text-[14px] font-medium text-white">{tier.name}</div>
      <div className="mb-[14px] text-[11px] text-white/40">{tier.desc}</div>
      <div className="text-[30px] font-medium tracking-[-1.2px] text-white">
        ${period === "monthly" ? tier.monthly : tier.annual}
        <span className="text-[13px] font-normal text-white/40">/{period === "monthly" ? "mo" : "yr"}</span>
      </div>
      <ul className="mt-4 space-y-1 text-[11px] leading-[1.6] text-white/50">
        {tier.features.map((f) => (
          <li key={f.text} className="flex items-baseline gap-1.5">
            <span className={cn(f.comingSoon && "text-white/35")}>{f.text}</span>
            {f.comingSoon && (
              <span className="shrink-0 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.6px] text-white/55">
                Soon
              </span>
            )}
          </li>
        ))}
      </ul>
      <PlanButton tier={tier.id} period={period} featured={tier.featured} />
    </div>
  );
}

/** Shown when a user runs out of tokens trying to render a full video — the real
 *  purchase moment. Video plans only. Fires plans_modal_viewed / _dismissed. */
export function PlansModal({
  open,
  onClose,
  trigger,
}: {
  open: boolean;
  onClose: () => void;
  /** Where the modal was opened from (e.g. "video_full"). */
  trigger: string;
}) {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");

  useEffect(() => {
    if (open) captureClient("plans_modal_viewed", { trigger, wanted: "video_full" });
  }, [open, trigger]);

  function close() {
    captureClient("plans_modal_dismissed", { trigger });
    onClose();
  }

  return (
    <Modal open={open} onClose={close} title="Unlock the full video" widthClass="max-w-[760px]">
      <div className="text-center">
        <h3 className="text-[18px] font-medium tracking-[-0.4px] text-white">
          Love your preview? Unlock the full 1080p video.
        </h3>
        <p className="mt-1.5 text-[12px] leading-relaxed text-white/45">
          A preview is a 10-second taste. A plan renders your whole song into a finished music video —
          and the tokens carry over to every video you make next.
        </p>
        <div className="mt-4 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 text-[12px]">
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
      </div>
      <div className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {VIDEO_TIERS.map((tier) => (
          <PlanCard key={tier.id} tier={tier} period={period} />
        ))}
      </div>
    </Modal>
  );
}
