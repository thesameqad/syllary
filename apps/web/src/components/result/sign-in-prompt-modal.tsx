import { useEffect } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Download, Film, Pencil, Sparkles, X } from "lucide-react";

export type SignInPromptReason =
  | "download"
  | "edit-lyrics"
  | "edit-details"
  | "inline-edit"
  | "regenerate"
  | "sync-timing"
  | "demo-limit";

const COPY: Record<SignInPromptReason, { title: string; body: string }> = {
  download: {
    title: "Sign up free to download",
    body: "Create a free account to download every lyric file — .lrc, .ttml, .srt, .vtt and more.",
  },
  "edit-lyrics": {
    title: "Sign up free to edit lyrics",
    body: "Free accounts can fine-tune the full transcript — punctuation, line breaks, the works.",
  },
  "edit-details": {
    title: "Sign up free to edit details",
    body: "Add artist, album, year, and streaming links so your public page looks the part.",
  },
  "inline-edit": {
    title: "Sign up free to fix a line",
    body: "Tap-to-fix any line and we'll re-align the timing automatically. It's free.",
  },
  regenerate: {
    title: "Sign up free to regenerate",
    body: "Higher-tier regeneration is included with the free account — no credit card needed.",
  },
  "sync-timing": {
    title: "Sign up free to fine-tune timing",
    body: "Drag every word into place on a full-song timeline. Free accounts get the full editor.",
  },
  "demo-limit": {
    title: "You've used your free demo",
    body: "Sign up free and we'll drop tokens in your account — enough to turn your own song into a full synced lyric video. No credit card.",
  },
};

type Perk = { icon: typeof Download; label: string };

const PERKS: Perk[] = [
  { icon: Download, label: "Download every format" },
  { icon: Pencil, label: "Edit lyrics & details" },
  { icon: Sparkles, label: "Regenerate in higher modes" },
];

/** The demo-limit prompt sells the video product, not the result-page editor. */
const DEMO_LIMIT_PERKS: Perk[] = [
  { icon: Sparkles, label: "Free tokens to start" },
  { icon: Film, label: "Make a lyric video from your own song" },
  { icon: Download, label: "Every synced lyric file, ready to ship" },
];

export function SignInPromptModal({
  open,
  reason,
  onClose,
  onCtaClick,
}: {
  open: boolean;
  reason: SignInPromptReason;
  onClose: () => void;
  /** Fired when a CTA is clicked, before navigation — lets callers track intent
   *  (e.g. the lyric-video demo funnel's `demo_signup_clicked`). */
  onCtaClick?: (target: "sign-up" | "sign-in") => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const copy = COPY[reason];
  const perks = reason === "demo-limit" ? DEMO_LIMIT_PERKS : PERKS;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sign-in-prompt-title"
            initial={{ opacity: 0, y: 22, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="relative w-full max-w-[440px] overflow-hidden rounded-[20px] border border-white/[0.08] bg-[linear-gradient(180deg,#1a1213_0%,#0d0d0d_100%)] shadow-[0_40px_120px_rgba(0,0,0,0.7),0_0_120px_rgba(255,45,45,0.18)]"
          >
            {/* Decorative glow */}
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-full bg-pulse/30 blur-3xl"
            />

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative px-7 pb-7 pt-9">
              <div className="mb-5 flex justify-center">
                <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#FF2D2D] to-[#8B0000] text-white shadow-[0_8px_28px_rgba(255,45,45,0.5)]">
                  <Sparkles className="h-6 w-6" />
                </span>
              </div>

              <h2
                id="sign-in-prompt-title"
                className="text-center text-[22px] font-medium leading-tight tracking-[-0.4px] text-white"
              >
                {copy.title}
              </h2>
              <p className="mx-auto mt-2.5 max-w-[340px] text-center text-[13.5px] leading-relaxed text-white/55">
                {copy.body}
              </p>

              <ul className="mt-6 space-y-2.5 rounded-[14px] border border-white/[0.06] bg-white/[0.02] p-4">
                {perks.map(({ icon: Icon, label }) => (
                  <li
                    key={label}
                    className="flex items-center gap-3 text-[13px] text-white/80"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-pulse/15 text-pulse">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1">{label}</span>
                    <Check className="h-3.5 w-3.5 text-success" />
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex flex-col gap-2.5">
                <Link
                  to="/sign-up"
                  onClick={() => {
                    onCtaClick?.("sign-up");
                    onClose();
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-pulse px-6 py-3 text-[14px] font-medium text-white shadow-[0_8px_28px_rgba(255,45,45,0.45)] transition-transform hover:scale-[1.02]"
                >
                  <Sparkles className="h-4 w-4" />
                  Create your free account
                </Link>
                <Link
                  to="/sign-in"
                  onClick={() => {
                    onCtaClick?.("sign-in");
                    onClose();
                  }}
                  className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-6 py-2.5 text-[13px] text-white/75 transition-colors hover:border-white/20 hover:text-white"
                >
                  I already have an account
                </Link>
              </div>

              <p className="mt-4 text-center text-[11.5px] text-white/35">
                Free forever — 3 songs to start, no credit card.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
