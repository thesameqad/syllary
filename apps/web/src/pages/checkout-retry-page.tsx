import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CreditCard, Loader2, RefreshCw } from "lucide-react";
import type { BillingPeriod, CheckoutRequest } from "@syllary/shared";
import { ApiError, startCheckout } from "@/lib/api";
import { captureClient } from "@/lib/analytics";
import { PLAN_LABEL } from "@/lib/plans";
import { LogoWordmark } from "@/components/logo";

const TIERS = ["starter", "creator", "pro", "reel", "studio", "premiere"] as const;
type Tier = CheckoutRequest["tier"];
const parseTier = (v: string | null): Tier | null =>
  (TIERS as readonly string[]).includes(v ?? "") ? (v as Tier) : null;

/** Stripe's cancel_url lands here — both deliberate back-outs and payment
 *  failures. Every payer to date completed within minutes of first attempt, so
 *  this screen's whole job is keeping the moment alive: name the plan, say
 *  nothing was charged, explain the usual fix (a regular card beats wallets),
 *  and restart checkout in one click. The 45-min recovery email is the backstop
 *  for people who leave anyway. */
export function CheckoutRetryPage() {
  const [params] = useSearchParams();
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const tier = parseTier(params.get("tier"));
  const period: BillingPeriod = params.get("period") === "annual" ? "annual" : "monthly";
  const songId = params.get("song");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    captureClient("checkout_retry_viewed", { tier, period, song_id: songId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Buyers normally arrive signed in (checkout required it), but sessions can
  // expire mid-checkout — route through sign-in and return to this exact page
  // instead of surfacing a raw 401.
  function signInAndReturn() {
    navigate(`/sign-in?redirect_url=${encodeURIComponent(location.pathname + location.search)}`);
  }

  async function retry() {
    if (!tier) return;
    captureClient("checkout_retry_clicked", { tier, period, song_id: songId });
    if (isSignedIn === false) {
      signInAndReturn();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      window.location.href = await startCheckout(tier, period, songId ?? undefined);
    } catch (err) {
      setLoading(false);
      if (err instanceof ApiError && err.status === 401) {
        signInAndReturn();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Something went wrong — try again in a moment.");
    }
  }

  const backHref = songId ? `/s/${songId}` : "/dashboard";

  return (
    <main className="grid min-h-dvh place-items-center bg-void px-4 py-10">
      <div className="w-full max-w-[460px]">
        <div className="mb-8 flex justify-center">
          <Link to="/" aria-label="Syllary home">
            <LogoWordmark />
          </Link>
        </div>
        <div className="rounded-[20px] border border-white/[0.08] bg-[linear-gradient(180deg,#161616_0%,#0a0a0a_100%)] p-8 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-pulse/[0.14] text-pulse">
            <CreditCard className="h-5 w-5" />
          </span>
          <h1 className="text-[20px] font-medium tracking-[-0.5px] text-white">
            Checkout didn&apos;t finish
          </h1>
          <p className="mt-1.5 text-[13px] text-white/55">
            <span className="font-medium text-white">Nothing was charged.</span> Your song and
            preview are exactly where you left them.
          </p>
          <p className="mx-auto mt-4 max-w-[360px] rounded-[12px] border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[12px] leading-relaxed text-white/60">
            If the payment was declined, it&apos;s almost always the bank or a wallet timing out —
            not you. A regular <span className="text-white/85">debit or credit card</span> works
            best; Apple&nbsp;Pay and Google&nbsp;Pay too.
          </p>
          {tier ? (
            <button
              type="button"
              onClick={retry}
              disabled={loading}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-pulse py-3 text-[14px] font-medium text-white shadow-[0_8px_28px_rgba(255,45,45,0.4)] transition-transform hover:scale-[1.02] disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {loading ? "Redirecting…" : `Try again with ${PLAN_LABEL[tier]} (${period})`}
            </button>
          ) : (
            <Link
              to={backHref}
              className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-pulse py-3 text-[14px] font-medium text-white transition-transform hover:scale-[1.02]"
            >
              Back to your music
            </Link>
          )}
          {error && <p className="mt-2 text-[11px] text-pulse">{error}</p>}
          {tier && (
            <Link
              to={backHref}
              className="mt-3 inline-block text-[12px] text-white/45 transition-colors hover:text-white"
            >
              {songId ? "Back to your song" : "Back to your dashboard"}
            </Link>
          )}
          <p className="mt-5 text-[11px] text-white/35">
            Something else in the way? Email{" "}
            <a href="mailto:anton@syllary.com" className="text-white/55 hover:text-white">
              anton@syllary.com
            </a>{" "}
            — it reaches the founder directly.
          </p>
        </div>
      </div>
    </main>
  );
}
