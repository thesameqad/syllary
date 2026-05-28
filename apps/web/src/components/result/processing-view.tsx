import { Fragment, lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Gamepad2, Loader2, MousePointer2, Trophy, X } from "lucide-react";
import type { SongStage } from "@syllary/shared";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

const LoadingScene = lazy(() => import("@/components/result/loading-scene"));
type GameStats = { height: number; max: number; ceilingHits: number };

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
  const [stats, setStats] = useState<GameStats>({ height: 0, max: 0, ceilingHits: 0 });
  const [howToDismissed, setHowToDismissed] = useState(false);
  // Receiver for the canvas → throttled to ~10Hz on the canvas side. Wrap in
  // useCallback so the prop reference is stable and LoadingScene doesn't churn.
  const onStats = useCallback((s: GameStats) => setStats(s), []);
  // Persist a personal best for the session so the user has something to chase
  // even across multiple loading screens in one sitting.
  const sessionBestRef = useRef(0);
  if (stats.max > sessionBestRef.current) sessionBestRef.current = stats.max;
  // Show the big how-to until the user explicitly dismisses it. Earlier we
  // auto-collapsed on a successful bounce, but the threshold (1.5m) was easy
  // to clear in one swing, which hid the banner before users had time to read
  // it. Now it stays put until they hit X.
  const showHowTo = !reduced && !howToDismissed;

  useEffect(() => {
    if (reduced) return;
    const t = window.setInterval(() => setTip((i) => (i + 1) % TIPS.length), 4200);
    return () => window.clearInterval(t);
  }, [reduced]);

  return (
    <div className="flex min-h-[62vh] flex-col items-center justify-center">
      {/* Big, friendly how-to-play banner — sits above the canvas so users
          can't miss that the equalizer is a mini-game. Collapses automatically
          after the first decent bounce, or when the user dismisses it. */}
      <AnimatePresence initial={false}>
        {showHowTo && (
          <motion.div
            key="howto"
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="mb-5 w-full max-w-[640px] overflow-hidden"
          >
            <div className="relative overflow-hidden rounded-[16px] border border-pulse/25 bg-gradient-to-br from-pulse/[0.14] via-pulse/[0.05] to-transparent p-5 shadow-[0_0_60px_rgba(255,45,45,0.12)] sm:p-6">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-pulse/25 blur-3xl"
              />
              <button
                type="button"
                onClick={() => setHowToDismissed(true)}
                aria-label="Hide game instructions"
                className="absolute right-2.5 top-2.5 rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="relative flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br from-[#FF2D2D] to-[#8B0000] text-white shadow-[0_8px_24px_rgba(255,45,45,0.45)]">
                  <Gamepad2 className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1 pr-6">
                  <h2 className="text-[20px] font-medium leading-tight tracking-[-0.4px] text-white sm:text-[22px]">
                    While we craft your lyrics — time to play
                  </h2>
                  <p className="mt-2 text-[14px] leading-relaxed text-white/65">
                    See the glowing ball above the bars? <span className="text-white">Move your mouse up and down</span>{" "}
                    to pump the bars taller. <span className="text-white">Pull up the moment the ball lands</span> on a
                    rising bar and you&apos;ll launch it up to the red ceiling.
                  </p>
                  <p className="mt-2 inline-flex items-center gap-2 text-[12.5px] text-pulse">
                    <MousePointer2 className="h-3.5 w-3.5" />
                    Let&apos;s see how many times you can make the ball hit the ceiling before we&apos;re done.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Equalizer */}
      <div className="relative h-[clamp(200px,34vh,320px)] w-full max-w-[640px]">
        {reduced ? (
          <div className="flex h-full items-end justify-center pb-6">
            <Loader2 className="h-9 w-9 animate-spin text-pulse" />
          </div>
        ) : (
          <Suspense fallback={null}>
            <LoadingScene stage={stage} reducedMotion={false} onStats={onStats} />
          </Suspense>
        )}
        {/* fade the bars into the text below */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-void" />

        {/* Mini-game HUD — primary score is ceiling hits (the new goal), with
            current bounce height kept as a secondary readout. Shows from the
            first bounce so the user sees something tracking right away. */}
        {!reduced && (stats.ceilingHits > 0 || sessionBestRef.current > 0.4) && (
          <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1 font-mono text-[11px] text-white/80 sm:left-4 sm:top-4">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-pulse/40 bg-black/55 px-3 py-1.5 text-[13px] backdrop-blur-sm">
              <Trophy className="h-3.5 w-3.5 text-pulse" />
              <span className="text-white">{stats.ceilingHits}</span>
              <span className="text-white/55">{stats.ceilingHits === 1 ? "hit" : "hits"}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-white/55 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-pulse shadow-[0_0_8px_#FF2D2D]" />
              {stats.height.toFixed(1)}m
            </div>
          </div>
        )}
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

        {!reduced && !showHowTo && (
          <p className="mt-4 text-[12px] text-white/25">
            Mini-game running above — pump the bars to launch the ball.
          </p>
        )}
      </div>
    </div>
  );
}
