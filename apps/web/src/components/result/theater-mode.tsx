import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

type RGB = [number, number, number];
const DEFAULT_COLOR: RGB = [124, 58, 200]; // vibrant violet fallback

/**
 * Fullscreen "theater" viewer: the video fills ~90% of the screen; the
 * surrounding "back lid" is an animated aurora glow in the video's dominant
 * color, and the whole frame gently beats with the music. When the video is
 * CORS-readable we use the real audio (Web Audio analyser) + sampled frame
 * colors; otherwise we fall back to a synthetic pulse + a default palette so it
 * still looks alive and never breaks playback.
 */
export function TheaterMode({
  open,
  src,
  title,
  onClose,
}: {
  open: boolean;
  src: string;
  title?: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const wiredRef = useRef(false);
  const [color, setColor] = useState<RGB>(DEFAULT_COLOR);
  // Attempt CORS for analysis/color; drop it (plain playback) if the load fails.
  const [cors, setCors] = useState(true);

  useEffect(() => {
    if (open) {
      wiredRef.current = false;
      setColor(DEFAULT_COLOR);
    }
  }, [open, src]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Animation loop: drive the video's "dance" scale + glow from audio energy
  // (or a synthetic pulse), and periodically sample the dominant color.
  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    if (!video) return;

    const freq = new Uint8Array(1024);
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 14;
    const c2d = canvas.getContext("2d", { willReadFrequently: true });

    let raf = 0;
    let smooth = 0;
    let colorAccum = 0;
    const start = performance.now();

    const sampleColor = () => {
      if (!cors || !c2d || video.readyState < 2) return;
      try {
        c2d.drawImage(video, 0, 0, canvas.width, canvas.height);
        const { data } = c2d.getImageData(0, 0, canvas.width, canvas.height);
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const R = data[i]!;
          const G = data[i + 1]!;
          const B = data[i + 2]!;
          const mx = Math.max(R, G, B);
          const mn = Math.min(R, G, B);
          if (mx < 24 || mx > 248) continue; // skip near-black / near-white
          const w = 1 + (mx - mn) / 200; // weight saturated pixels
          r += R * w;
          g += G * w;
          b += B * w;
          n += w;
        }
        if (n > 0) setColor([Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
      } catch {
        setCors(false); // tainted → no CORS; stop sampling
      }
    };

    const tick = (t: number) => {
      const analyser = analyserRef.current;
      let e: number;
      if (video.paused) {
        // Paused: settle to a calm resting glow — no beat, no synthetic pulse.
        e = 0;
      } else if (analyser) {
        analyser.getByteFrequencyData(freq);
        const bins = analyser.frequencyBinCount;
        let bass = 0;
        const nb = Math.min(40, bins);
        for (let i = 0; i < nb; i++) bass += freq[i]!;
        bass /= nb * 255;
        let all = 0;
        for (let i = 0; i < bins; i++) all += freq[i]!;
        all /= bins * 255;
        e = Math.min(1, bass * 0.8 + all * 0.5);
      } else {
        // Synthetic, organic-feeling pulse (layered sines).
        const s = (t - start) / 1000;
        e = 0.4 + 0.2 * Math.sin(s * 4.6) + 0.12 * Math.sin(s * 2.1 + 1) + 0.06 * Math.sin(s * 9.3);
        e = Math.max(0, Math.min(1, e));
      }
      // Ease toward the target so motion is fluid, faster when louder.
      smooth += (e - smooth) * 0.3;
      if (boxRef.current) boxRef.current.style.transform = `scale(${(1 + smooth * 0.05).toFixed(4)})`;
      if (glowRef.current) {
        glowRef.current.style.opacity = (0.35 + smooth * 0.65).toFixed(3);
        glowRef.current.style.transform = `scale(${(1 + smooth * 0.18).toFixed(4)})`;
      }
      colorAccum += 16;
      if (colorAccum > 1400) {
        colorAccum = 0;
        sampleColor();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, cors]);

  // Wire Web Audio on the FIRST user interaction (gesture-safe), so the
  // AudioContext actually resumes — creating it on a non-gesture event leaves
  // it "suspended" and the analyser reads zeros (which looked un-synced). Runs
  // once per element; always resumes if already wired.
  const ensureAudio = () => {
    const video = videoRef.current;
    if (!video) return;
    if (cors && !wiredRef.current) {
      try {
        const ctx = new AudioContext();
        const sourceNode = ctx.createMediaElementSource(video);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.82;
        sourceNode.connect(analyser);
        analyser.connect(ctx.destination);
        ctxRef.current = ctx;
        analyserRef.current = analyser;
        wiredRef.current = true;
      } catch {
        // createMediaElementSource can only run once per element; ignore.
      }
    }
    void ctxRef.current?.resume();
  };

  // Tear down the audio graph when closing.
  useEffect(() => {
    if (open) return;
    analyserRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }, [open]);

  const rgb = `${color[0]}, ${color[1]}, ${color[2]}`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#050505]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          onPointerDownCapture={ensureAudio}
        >
          {/* Animated color back-lid. */}
          <div ref={glowRef} className="pointer-events-none absolute inset-0">
            <div
              className="theater-blob"
              style={{ background: `radial-gradient(closest-side, rgba(${rgb},0.6), transparent)`, top: "-18%", left: "-8%" }}
            />
            <div
              className="theater-blob theater-blob-2"
              style={{ background: `radial-gradient(closest-side, rgba(${rgb},0.45), transparent)`, bottom: "-20%", right: "-6%" }}
            />
            <div
              className="theater-blob theater-blob-3"
              style={{ background: `radial-gradient(closest-side, rgba(${rgb},0.32), transparent)`, top: "25%", left: "38%" }}
            />
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close theater"
            className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] text-white/80 backdrop-blur transition-colors hover:bg-white/15 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Video box (~90% of the screen) that beats with the music. */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 26 }}
            className="relative z-[1]"
            style={{ width: "min(90vw, calc(90vh * 16 / 9))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              ref={boxRef}
              className="relative overflow-hidden rounded-[18px] will-change-transform"
              style={{ boxShadow: `0 0 90px 0 rgba(${rgb},0.55), 0 30px 90px rgba(0,0,0,0.65)` }}
            >
              <video
                key={cors ? "cors" : "plain"}
                ref={videoRef}
                src={src}
                controls
                controlsList="nodownload"
                onContextMenu={(e) => e.preventDefault()}
                autoPlay
                playsInline
                {...(cors ? { crossOrigin: "anonymous" as const } : {})}
                onError={() => cors && setCors(false)}
                className="block aspect-video w-full bg-black"
              />
            </div>
            {title && (
              <div className="mt-3 text-center text-[13px] text-white/55">{title}</div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
