import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  estimateVideoCost,
  PLAN_CREDITS,
  type BillingPeriod,
  type Song,
  type VideoModel,
} from "@syllary/shared";
import { ApiError, startCheckout } from "@/lib/api";
import { captureClient } from "@/lib/analytics";
import { bonusTokens, firstMonthTokens, type PlanTier, VIDEO_TIERS } from "@/lib/plans";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

const STYLE_LABEL: Record<VideoModel, string> = {
  fast: "Slideshow",
  normal: "Living Scenes",
  pro: "Cinematic",
};

/** A single video plan's CTA — kicks off Stripe checkout. Fires `plan_selected`
 *  so the funnel can see the purchase intent (the modal redirects away on click,
 *  so this is the last client event before Stripe). */
function PlanButton({
  tier,
  period,
  featured,
  songId,
}: {
  tier: PlanTier["id"];
  period: BillingPeriod;
  featured?: boolean;
  songId?: string;
}) {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    captureClient("plan_selected", { tier, period, signed_in: !!isSignedIn });
    if (!isSignedIn) {
      // Come back to the song after auth — landing on /dashboard here loses
      // the hottest lead in the funnel (they just tried to buy).
      const back = songId ? `?redirect_url=${encodeURIComponent(`/s/${songId}`)}` : "";
      navigate(`/sign-up${back}`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      window.location.href = await startCheckout(tier, period, songId);
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

function PlanCard({
  tier,
  period,
  featured,
  badgeLabel,
  anchorTokens,
  liteTokens,
  songId,
}: {
  tier: PlanTier;
  period: BillingPeriod;
  /** Overrides tier.featured so the modal can spotlight Reel while the landing
   *  page keeps Studio. Undefined = use the tier's own flag. */
  featured?: boolean;
  badgeLabel?: string;
  /** Full-render token price of THIS song at the previewed (Medium) quality. */
  anchorTokens?: number | null;
  /** Same render priced on Lite — when available it makes the HEADLINE count
   *  (founder call: the big number must be the best honest one; "≈ 1 video"
   *  is technically true and commercially fatal). Medium stays as the labeled
   *  small print so the generate screen never reads as a bait-and-switch. */
  liteTokens?: number | null;
  songId?: string;
}) {
  const isFeatured = featured ?? tier.featured;
  const bonus = bonusTokens(tier.id);
  const month1 = firstMonthTokens(tier.id);
  const liteCovers = liteTokens ? Math.floor(month1 / liteTokens) : null;
  const mediumCovers = anchorTokens ? Math.floor(month1 / anchorTokens) : null;
  // Headline = Lite count when Lite exists for the previewed style, else Medium.
  const covers = liteCovers && liteCovers >= 1 ? liteCovers : mediumCovers;
  const coversIsLite = liteCovers != null && liteCovers >= 1;
  const features =
    covers && covers >= 1
      ? tier.features.filter((f) => !f.text.includes("your first month"))
      : tier.features;
  return (
    <div
      className={cn(
        "relative rounded-[16px] p-5 text-left",
        isFeatured
          ? "border-[1.5px] border-pulse bg-[linear-gradient(180deg,#1a0a0a_0%,#0a0303_100%)]"
          : "border-[0.5px] border-white/[0.08] bg-[linear-gradient(180deg,#161616_0%,#0a0a0a_100%)]",
      )}
    >
      {isFeatured && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-pulse px-3 py-1 text-[10px] font-medium uppercase tracking-[0.8px] text-white">
          {badgeLabel ?? "Most popular"}
        </span>
      )}
      <div className="text-[14px] font-medium text-white">{tier.name}</div>
      <div className="mb-[14px] text-[11px] text-white/40">{tier.desc}</div>
      <div className="text-[30px] font-medium tracking-[-1.2px] text-white">
        ${period === "monthly" ? tier.monthly : tier.annual}
        <span className="text-[13px] font-normal text-white/40">/{period === "monthly" ? "mo" : "yr"}</span>
      </div>
      {covers && covers >= 1 ? (
        <>
          <div className="mt-2 text-[15px] font-medium text-white">
            ≈ {covers} full video{covers === 1 ? "" : "s"}{" "}
            {coversIsLite && <span className="font-normal text-white/60">in Lite quality</span>}
          </div>
          <div className="mt-0.5 text-[11px] text-white/45">of this song, month one</div>
          {coversIsLite && mediumCovers != null && mediumCovers >= 1 && (
            <div className="mt-0.5 text-[11px] text-white/40">
              ≈ {mediumCovers} in Medium — your preview's quality
            </div>
          )}
          <div className="mt-1 text-[11px] text-white/40">
            {PLAN_CREDITS[tier.id].toLocaleString()} tokens / month
          </div>
        </>
      ) : (
        <div className="mt-2 text-[12px] text-white/60">
          {PLAN_CREDITS[tier.id].toLocaleString()} tokens / month
        </div>
      )}
      {bonus > 0 && (
        <>
          <div className="mt-2 rounded-[10px] border border-pulse/50 bg-pulse/[0.12] px-3 py-2">
            <div className="text-[16px] font-medium tracking-[-0.3px] text-pulse">
              🎁 +{bonus.toLocaleString()} sign-up bonus
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
        {features.map((f) => (
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
      <PlanButton tier={tier.id} period={period} featured={isFeatured} songId={songId} />
    </div>
  );
}

/** Ignorable one-tap "why not?" row at the bottom of the paywall. No exit
 *  interception — leavers leave untouched; hesitators get a one-click way to
 *  tell us why. Answers land in PostHog as plans_modal_feedback. */
const FEEDBACK_OPTIONS = [
  { key: "too_expensive", label: "Too expensive" },
  { key: "one_video", label: "I only need one video" },
  { key: "just_looking", label: "Just looking" },
] as const;

function FeedbackRow({ trigger, songId, estimatedTokens }: { trigger: string; songId?: string; estimatedTokens?: number }) {
  const [answered, setAnswered] = useState(false);
  if (answered) {
    return <p className="mt-5 text-center text-[11px] text-white/40">Thanks — this genuinely helps 🙏</p>;
  }
  return (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-white/35">
      <span>Not what you need?</span>
      {FEEDBACK_OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => {
            captureClient("plans_modal_feedback", {
              trigger,
              answer: o.key,
              song_id: songId,
              estimated_tokens: estimatedTokens,
            });
            setAnswered(true);
          }}
          className="rounded-full border border-white/10 px-2.5 py-1 text-white/45 transition-colors hover:border-white/25 hover:text-white/80"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Shown when a user runs out of tokens trying to render a full video — the real
 *  purchase moment. Video plans only. Fires plans_modal_viewed / _dismissed. */
export function PlansModal({
  open,
  onClose,
  trigger,
  song,
}: {
  open: boolean;
  onClose: () => void;
  /** Where the modal was opened from (e.g. "video_full", "video_editor"). */
  trigger: string;
  /** When present, anchors the pitch to THIS song's real full-render price. */
  song?: Song | null;
}) {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const fromEditor = trigger === "video_editor";

  // Anchor with the style the user actually previewed (falling back to Living
  // Scenes) at the quality the promote path will actually charge (Medium) — the
  // old Lite-only anchor quoted a number ~6× below the real "Generate full
  // video" price, which read as bait one click later.
  const previewedModel: VideoModel = useMemo(() => {
    if (song?.activeVideoJob?.model) return song.activeVideoJob.model;
    const lastPreview = [...(song?.videos ?? [])].reverse().find((v) => v.isPreview);
    return lastPreview?.model ?? "normal";
  }, [song]);

  const anchorTokens = useMemo(() => {
    if (!song?.lyrics) return null;
    const est = estimateVideoCost({
      model: previewedModel,
      quality: "fast",
      imageSize: "1K",
      lyrics: song.lyrics,
      durationSeconds: song.durationSeconds ?? null,
    });
    return est.tokens > 0 ? est.tokens : null;
  }, [song, previewedModel]);

  // The affordability story stays: Lite is the cheap tier for the two styles
  // that support it. Shown as a secondary "from ~N tokens" note, never as the
  // headline number.
  const liteTokens = useMemo(() => {
    if (!song?.lyrics || previewedModel === "pro") return null;
    const est = estimateVideoCost({
      model: previewedModel,
      quality: "lite",
      imageSize: "1K",
      lyrics: song.lyrics,
      durationSeconds: song.durationSeconds ?? null,
    });
    return est.tokens > 0 && est.tokens < (anchorTokens ?? Infinity) ? est.tokens : null;
  }, [song, previewedModel, anchorTokens]);

  // Headline math runs on Lite when the previewed style supports it (founder
  // call: lead with the best honest count), Medium otherwise. Medium always
  // stays visible as labeled small print — the generate screen charges it.
  const headlineTokens = liteTokens ?? anchorTokens;
  const headlineIsLite = liteTokens != null;
  const reelCovers = headlineTokens ? Math.floor(firstMonthTokens("reel") / headlineTokens) : null;
  const mediumReelCovers = anchorTokens ? Math.floor(firstMonthTokens("reel") / anchorTokens) : null;
  // Skip the per-video note when Reel only covers the song once — "$39 per
  // video" next to "$39/mo" reads as a typo, not an anchor.
  const perVideoUsd =
    reelCovers && reelCovers >= 2 ? Math.round((39 / reelCovers) * 10) / 10 : null;

  useEffect(() => {
    if (open)
      captureClient("plans_modal_viewed", {
        trigger,
        wanted: fromEditor ? "editor_tokens" : "video_full",
        song_id: song?.id,
        estimated_tokens: anchorTokens,
        previewed_model: previewedModel,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trigger]);

  function close() {
    captureClient("plans_modal_dismissed", { trigger, song_id: song?.id, estimated_tokens: anchorTokens });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={fromEditor ? "Top up to keep editing" : "Unlock the full video"}
      widthClass="max-w-[760px]"
    >
      <div className="text-center">
        <p className="text-[13px] leading-relaxed text-white/55">
          {fromEditor
            ? "You're out of tokens mid-edit. A plan tops up your balance so you can keep refining scenes and render the full video."
            : "A preview is 10 seconds. A plan renders your whole song into a finished 1080p music video, ready for YouTube."}
        </p>
        {headlineTokens != null && reelCovers != null && reelCovers >= 1 && (
          <p className="mt-2.5 text-[13px] text-white/70">
            This song renders full-length from ~
            <span className="font-medium text-white">{headlineTokens.toLocaleString()} tokens</span>
            {headlineIsLite && " on Lite"} — Reel's first month covers it{" "}
            <span className="font-medium text-pulse">{reelCovers}×</span>
            {perVideoUsd != null && (
              <span className="text-white/55"> (≈ ${perVideoUsd} per video)</span>
            )}
            {headlineIsLite && anchorTokens != null && (
              <span className="block text-[11px] text-white/40">
                {STYLE_LABEL[previewedModel]} at Medium — your preview's quality — is ~
                {anchorTokens.toLocaleString()} tokens
                {mediumReelCovers != null && mediumReelCovers >= 1 && ` (${mediumReelCovers}× month one)`}
              </span>
            )}
          </p>
        )}
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
        {/* Risk-reversal ABOVE the cards — on mobile the old placement was 3-4
            screens deep, past the decision point. */}
        <p className="mt-2.5 text-[11px] text-white/40">
          Cancel anytime · Secure Stripe checkout · Unused tokens stay yours until your period ends
        </p>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {VIDEO_TIERS.map((tier) => (
          <PlanCard
            key={tier.id}
            tier={tier}
            period={period}
            // In the paywall the spotlight belongs on the entry plan — a $99
            // "Most popular" badge below the mobile fold anchored people to a
            // price 2.5× the one they can say yes to. Landing keeps Studio.
            featured={tier.id === "reel"}
            badgeLabel={tier.id === "reel" ? "Best for your first video" : undefined}
            anchorTokens={anchorTokens}
            liteTokens={liteTokens}
            songId={song?.id}
          />
        ))}
      </div>
      <FeedbackRow trigger={trigger} songId={song?.id} estimatedTokens={anchorTokens ?? undefined} />
    </Modal>
  );
}
