import { lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { useMediaQuery, usePrefersReducedMotion } from "@/hooks/use-reduced-motion";

// Three.js is code-split out of the initial bundle (perf budget).
const AudioBarsScene = lazy(() => import("./audio-bars"));

export function HeroBackground() {
  const reduced = usePrefersReducedMotion();
  const coarsePointer = useMediaQuery("(hover: none)");
  const isMobile = useMediaQuery("(max-width: 640px)");

  const barCount = isMobile ? 40 : 80;
  const parallax = !coarsePointer && !reduced;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 38%, #2a0a0a 0%, #0a0303 35%, #000 70%)",
        }}
      />

      <div
        className="animate-drift-a absolute left-[8%] top-[10%] h-[200px] w-[200px] rounded-full blur-[40px]"
        style={{ background: "radial-gradient(circle, rgba(255,45,45,0.40), transparent 70%)" }}
      />
      <div
        className="animate-drift-b absolute right-[5%] top-[55%] h-[300px] w-[300px] rounded-full blur-[60px]"
        style={{ background: "radial-gradient(circle, rgba(216,24,24,0.30), transparent 70%)" }}
      />
      <div
        className="animate-drift-c absolute right-[28%] top-[28%] h-[160px] w-[160px] rounded-full blur-[30px]"
        style={{ background: "radial-gradient(circle, rgba(255,107,107,0.25), transparent 70%)" }}
      />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        className="absolute inset-x-0 bottom-0 h-[240px] [-webkit-mask-image:linear-gradient(to_top,black_0%,black_30%,transparent_80%)] [mask-image:linear-gradient(to_top,black_0%,black_30%,transparent_80%)]"
      >
        <Suspense fallback={null}>
          <AudioBarsScene reducedMotion={reduced} parallax={parallax} count={barCount} />
        </Suspense>
      </motion.div>

      <div className="grain-overlay absolute inset-0 opacity-[0.04] mix-blend-overlay" />
    </div>
  );
}
