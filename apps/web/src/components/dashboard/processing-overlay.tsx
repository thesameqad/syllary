import { useEffect, useState } from "react";

/**
 * Per-stage time budgets (in seconds) used to drive the library card progress
 * bar. These are calibrated against typical 3-minute songs running through
 * Demucs (htdemucs_ft + shifts:2) and 3× WhisperX large-v3 + Opus reconcile.
 * The bar never reaches 100% before the row actually flips to "ready" — we
 * cap each stage's progress and reserve the final 5% for the finalize step.
 */
const STAGE_BUDGETS = {
  separating: { label: "Isolating vocals", durationSec: 50, start: 0.0, end: 0.5 },
  transcribing: { label: "Transcribing & reconciling", durationSec: 40, start: 0.5, end: 0.95 },
} as const;

type Stage = keyof typeof STAGE_BUDGETS;

function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function ProcessingOverlay({
  startedAt,
  stage,
}: {
  /** ISO timestamp of when processing actually began. */
  startedAt: string;
  stage: Stage | null;
}) {
  // Tick once per second so elapsed time and the progress bar advance smoothly
  // between polls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const baseline = new Date(startedAt).getTime();
  const elapsedSec = Math.max(0, (now - baseline) / 1000);

  const current = stage ? STAGE_BUDGETS[stage] : STAGE_BUDGETS.separating;
  // Within the current stage, interpolate from start% → end% over its budget.
  // Asymptote to 95% of the stage range so the bar slows down rather than
  // pinning when a stage runs long.
  const stageElapsed =
    stage === "transcribing"
      ? Math.max(0, elapsedSec - STAGE_BUDGETS.separating.durationSec)
      : elapsedSec;
  const stageProgress = 1 - Math.exp(-stageElapsed / current.durationSec);
  const fillRatio = current.start + (current.end - current.start) * stageProgress;
  const fillPct = Math.min(0.95, fillRatio) * 100;

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-t from-black/85 via-black/70 to-black/55 backdrop-blur-md">
      {/* Top region: animated equalizer + soft radial glow. Sits above the
          progress panel so the two never overlap. */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <div
          className="absolute h-56 w-56 rounded-full bg-pulse/25 blur-3xl"
          style={{ animation: "syllary-pulse-glow 2.4s ease-in-out infinite" }}
        />
        <div className="relative flex items-end gap-[7px]" aria-hidden>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span
              key={i}
              className="block w-[8px] rounded-full bg-pulse shadow-[0_0_18px_rgba(255,45,45,0.75)]"
              style={{
                height: 16,
                animation: "syllary-eq 1.1s ease-in-out infinite",
                animationDelay: `${i * 0.11}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Bottom region: stage label, elapsed timer, progress bar. */}
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between text-[11px] font-medium">
          <span className="flex items-center gap-1.5 text-white">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-pulse" />
            </span>
            {current.label}
          </span>
          <span className="tabular-nums text-white/60">{formatElapsed(elapsedSec)}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-pulse to-[#ff6464] transition-[width] duration-700 ease-out"
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>

      <style>{`
        @keyframes syllary-eq {
          0%, 100% { height: 16px; opacity: 0.55; }
          50%      { height: 96px; opacity: 1; }
        }
        @keyframes syllary-pulse-glow {
          0%, 100% { transform: scale(0.85); opacity: 0.45; }
          50%      { transform: scale(1.15); opacity: 0.8; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="syllary-eq"], [style*="syllary-pulse-glow"] {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
