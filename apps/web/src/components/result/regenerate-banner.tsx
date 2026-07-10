import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Sparkles, Wand2, X } from "lucide-react";
import {
  creditCost,
  GENERATION_MODES,
  type GenerationMode,
  MODE_INFO,
} from "@syllary/shared";
import { ApiError, regenerateSong } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

const MODE_ICON: Record<GenerationMode, typeof Sparkles> = {
  fast: Sparkles,
  normal: Wand2,
  pro: Sparkles,
};

export function RegenerateBanner({
  songId,
  currentMode,
  durationSeconds,
  variant = "accuracy-hint",
  onIntercept,
}: {
  songId: string;
  currentMode: GenerationMode;
  durationSeconds: number | null;
  /** "accuracy-hint": offer modes strictly above currentMode (default, used on
   *  a ready song). "retry-failed": offer all modes (used after a failure). */
  variant?: "accuracy-hint" | "retry-failed";
  /** When set and returns true, the regenerate click is intercepted (e.g.
   *  anonymous viewer → sign-in popup) and no API call is made. */
  onIntercept?: () => boolean;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<GenerationMode | null>(null);
  // Transient dismiss — clears on reload (remount) or when the song changes, so
  // the hint comes back next time; it just gets out of the way while editing.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDismissed(false), [songId]);
  const choices =
    variant === "retry-failed"
      ? [...GENERATION_MODES]
      : GENERATION_MODES.filter(
          (m) => GENERATION_MODES.indexOf(m) > GENERATION_MODES.indexOf(currentMode),
        );
  if (choices.length === 0) return null;
  if (dismissed) return null;

  async function run(mode: GenerationMode) {
    if (onIntercept?.()) return;
    setBusy(mode);
    try {
      await regenerateSong(songId, mode);
      toast(`Regenerating with ${MODE_INFO[mode].label} mode…`);
      // Send the user to Recent so they can watch the card progress and come
      // back when it's ready (the result page would otherwise sit on the old
      // "ready" UI until the next poll flips it to "processing").
      navigate("/recent");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not regenerate.", "error");
      setBusy(null);
    }
  }

  const heading =
    variant === "retry-failed" ? "Try regenerating with a different mode" : "Seeing errors in the lyrics?";
  const body =
    variant === "retry-failed" ? (
      <>
        Pick any generation mode below to retry — we&apos;ll reuse the audio file you already
        uploaded.
      </>
    ) : (
      <>
        This track might be too complex for{" "}
        <span className="font-medium text-white/80">{MODE_INFO[currentMode].label}</span> mode.
        Regenerate in a higher tier for better accuracy — we&apos;ll reuse the audio file you
        already uploaded.
      </>
    );

  return (
    <div className="relative mt-6 rounded-[14px] border border-white/[0.08] bg-gradient-to-br from-pulse/[0.06] to-transparent p-4">
      {variant === "accuracy-hint" && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="absolute right-2.5 top-2.5 rounded-md p-1 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-pulse/15 text-pulse">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 pr-6">
          <h3 className="text-[13px] font-medium text-white">{heading}</h3>
          <p className="mt-1 text-[12px] leading-snug text-white/55">{body}</p>
        </div>
      </div>
      {/* Outside the icon column so max-sm:w-full spans the whole card on
          mobile; sm:pl-11/pr-6 reproduce the column's exact desktop geometry
          (icon w-8 + gap-3 = 44px = pl-11). */}
      <div className="mt-3 flex flex-wrap gap-2 sm:pl-11 sm:pr-6">
        {choices.map((mode) => {
          const Icon = MODE_ICON[mode];
          const cost = creditCost(durationSeconds ?? 60, mode);
          const isBusy = busy === mode;
          const disabled = busy !== null;
          return (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              onClick={() => void run(mode)}
              className="group inline-flex items-center gap-2 rounded-full border border-pulse/30 bg-pulse/[0.08] px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:border-pulse hover:bg-pulse/[0.15] disabled:opacity-60 disabled:hover:border-pulse/30 disabled:hover:bg-pulse/[0.08] max-sm:w-full max-sm:justify-between max-sm:py-2.5"
              title={MODE_INFO[mode].description}
            >
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                {isBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-pulse" />
                ) : (
                  <Icon className="h-3.5 w-3.5 text-pulse" />
                )}
                <span className="sm:hidden">{MODE_INFO[mode].label}</span>
                <span className="hidden sm:inline">Regenerate with {MODE_INFO[mode].label}</span>
              </span>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-black/30 px-2 py-0.5 text-[10px] text-white/65">
                {cost} tokens
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
