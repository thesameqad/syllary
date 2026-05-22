import { Fragment, lazy, Suspense, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import type { SongStage } from "@syllary/shared";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

const LoadingScene = lazy(() => import("@/components/result/loading-scene"));

const STEPS = [
  { key: "separating", label: "Isolating vocals" },
  { key: "transcribing", label: "Transcribing" },
  { key: "polishing", label: "Polishing lyrics" },
] as const;

const TIPS = [
  "You'll get .lrc, enhanced .lrc, .ttml, .srt, .vtt, .txt and .json.",
  "Apple Music prefers word-synced .ttml — generated automatically.",
  "Every file is validated and ready to ship to any distributor.",
  "You can fine-tune the words and timing once this finishes.",
  "Spotify and most platforms read synced lyrics from .lrc.",
];

function headingFor(stage: SongStage | null): string {
  if (stage === "separating") return "Isolating the vocals…";
  if (stage === "transcribing") return "Transcribing your track…";
  return "Warming up…";
}

export function ProcessingView({
  stage,
  filename,
}: {
  stage: SongStage | null;
  filename: string;
}) {
  const reduced = usePrefersReducedMotion();
  const current = stage === "transcribing" ? 1 : 0; // pending/separating → step 0
  const [tip, setTip] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const t = window.setInterval(() => setTip((i) => (i + 1) % TIPS.length), 4200);
    return () => window.clearInterval(t);
  }, [reduced]);

  return (
    <div className="flex min-h-[62vh] flex-col items-center justify-center">
      {/* Equalizer */}
      <div className="relative h-[clamp(200px,34vh,320px)] w-full max-w-[640px]">
        {reduced ? (
          <div className="flex h-full items-end justify-center pb-6">
            <Loader2 className="h-9 w-9 animate-spin text-pulse" />
          </div>
        ) : (
          <Suspense fallback={null}>
            <LoadingScene stage={stage} reducedMotion={false} />
          </Suspense>
        )}
        {/* fade the bars into the text below */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-void" />
      </div>

      {/* Text + progress, beneath the equalizer */}
      <div className="mt-1 flex flex-col items-center text-center">
        <motion.h1
          key={headingFor(stage)}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="text-[24px] font-medium tracking-[-0.6px]"
        >
          {headingFor(stage)}
        </motion.h1>
        <p className="mt-2 text-[14px] text-white/50">{filename} · this can take a minute or two</p>

        {/* Stage stepper */}
        <div className="mt-5 flex items-center gap-2.5 sm:gap-3">
          {STEPS.map((step, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <Fragment key={step.key}>
                {i > 0 && (
                  <span
                    className={cn("h-px w-5 sm:w-9", i <= current ? "bg-pulse/60" : "bg-white/10")}
                  />
                )}
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full",
                      done
                        ? "bg-pulse text-white"
                        : active
                          ? "border border-pulse"
                          : "border border-white/15",
                    )}
                  >
                    {done ? (
                      <Check className="h-2.5 w-2.5" />
                    ) : active && !reduced ? (
                      <motion.span
                        className="h-1.5 w-1.5 rounded-full bg-pulse"
                        animate={{ opacity: [1, 0.25, 1], scale: [1, 0.8, 1] }}
                        transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
                      />
                    ) : active ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-pulse" />
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] transition-colors",
                      active || done ? "text-white/80" : "text-white/35",
                    )}
                  >
                    {step.label}
                  </span>
                </span>
              </Fragment>
            );
          })}
        </div>

        {/* Rotating tips */}
        <div className="mt-5 flex h-5 max-w-[440px] items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={tip}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.4 }}
              className="text-[12px] text-white/35"
            >
              {TIPS[tip]}
            </motion.p>
          </AnimatePresence>
        </div>

        {!reduced && (
          <p className="mt-4 text-[12px] text-white/25">Move your mouse up to pump up the beat.</p>
        )}
      </div>
    </div>
  );
}
