import { useEffect, useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight, Clapperboard } from "lucide-react";
import type { VideoModel } from "@syllary/shared";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";

gsap.registerPlugin(ScrollTrigger);

/** Landing-page marketing copy for the three lyric-video styles. Intentionally
 *  punchier than the in-product VIDEO_MODEL_INFO descriptions; the example clips
 *  are the same ones shown in the Generate-video modal (web/public/format-previews/). */
const STYLES: Array<{
  model: VideoModel;
  index: string;
  label: string;
  tagline: string;
  copy: string;
  motion: 1 | 2 | 3;
}> = [
  {
    model: "fast",
    index: "01",
    label: "Slideshow",
    tagline: "Still scenes, gentle drift",
    copy: "A painted AI scene for every line, with your lyrics woven into the artwork. Each frame slowly drifts and breathes — elegant, and ready in minutes.",
    motion: 1,
  },
  {
    model: "normal",
    index: "02",
    label: "Living Scenes",
    tagline: "The whole world moves",
    copy: "Every line becomes its own moving shot. Light shifts, clouds roll, streets hum — the scenery comes alive behind your words.",
    motion: 2,
  },
  {
    model: "pro",
    index: "03",
    label: "Cinematic",
    tagline: "A real music video",
    copy: "One continuous film. An AI director flows every shot into the next with dynamic camera moves and evolving scenes — the full premium cut.",
    motion: 3,
  },
];

/** Looping example clip that only plays while on screen, so three videos on the
 *  landing page don't burn battery off-screen. */
function PreviewLoop({ model }: { model: VideoModel }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.2 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      src={`/format-previews/${model}.mp4`}
      muted
      loop
      playsInline
      preload="metadata"
      className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
    />
  );
}

/** 3D mouse-tracking tilt with a glare sheen that follows the cursor. The parent
 *  supplies `perspective`; we only tilt this single plane (the card keeps
 *  overflow-hidden, which would flatten any deeper 3D nesting anyway). */
function TiltCard({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    const glare = glareRef.current;
    if (!el || !glare || reduced) return;
    if (!window.matchMedia("(hover: hover)").matches) return;

    const rotX = gsap.quickTo(el, "rotationX", { duration: 0.45, ease: "power3.out" });
    const rotY = gsap.quickTo(el, "rotationY", { duration: 0.45, ease: "power3.out" });
    const glareX = gsap.quickTo(glare, "x", { duration: 0.45, ease: "power3.out" });
    const glareY = gsap.quickTo(glare, "y", { duration: 0.45, ease: "power3.out" });

    function onMove(e: PointerEvent) {
      if (!el || !glare) return;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 … 0.5
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      rotX(-py * 9);
      rotY(px * 11);
      glareX(px * rect.width);
      glareY(py * rect.height);
      gsap.to(glare, { opacity: 1, duration: 0.3 });
    }

    function onLeave() {
      rotX(0);
      rotY(0);
      if (glare) gsap.to(glare, { opacity: 0, duration: 0.5 });
    }

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [reduced]);

  return (
    <div ref={ref} className={className} style={{ willChange: "transform" }}>
      {children}
      <div
        ref={glareRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-full opacity-0"
        style={{
          background:
            "radial-gradient(420px circle at 50% 50%, rgba(255,255,255,0.10), rgba(255,45,45,0.04) 45%, transparent 70%)",
        }}
      />
    </div>
  );
}

function MotionMeter({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex items-end gap-[3px]">
        {[1, 2, 3].map((bar) => (
          <span
            key={bar}
            className="w-[3px] rounded-full"
            style={{
              height: `${5 + bar * 3}px`,
              background: bar <= level ? "#FF2D2D" : "rgba(255,255,255,0.15)",
              boxShadow: bar <= level ? "0 0 8px rgba(255,45,45,0.6)" : "none",
            }}
          />
        ))}
      </span>
      <span className="text-[10px] uppercase tracking-[1.5px] text-white/35">Motion</span>
    </span>
  );
}

export function LyricVideoShowcase() {
  const root = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();

  useGSAP(
    () => {
      if (reduced) return;

      // Entrance — header lines, then the cards rise in a stagger.
      gsap.from(".js-vv-head > *", {
        y: 24,
        opacity: 0,
        duration: 0.7,
        stagger: 0.08,
        ease: "power3.out",
        scrollTrigger: { trigger: ".js-vv-head", start: "top 80%" },
      });

      // Cards flip up out of the page plane (the grid supplies the perspective).
      gsap.from(".js-vv-card", {
        y: 70,
        opacity: 0,
        rotationX: -14,
        transformOrigin: "center bottom",
        duration: 0.9,
        stagger: 0.12,
        ease: "power3.out",
        scrollTrigger: { trigger: ".js-vv-grid", start: "top 82%" },
      });

      // Giant ghost word drifts sideways through the whole section.
      gsap.fromTo(
        ".js-vv-word",
        { xPercent: 6 },
        {
          xPercent: -14,
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top bottom",
            end: "bottom top",
            scrub: 1,
          },
        },
      );

      const mm = gsap.matchMedia();
      mm.add("(min-width: 1024px)", () => {
        // Parallax: the three columns start staggered (static margins below) and
        // drift at different speeds as you scroll, crossing past each other.
        // yPercent keeps this independent from the entrance tween's `y`.
        const speeds = [4, -10, -22];
        // Coverflow: the side cards start angled into the screen and rotate
        // flat as the grid approaches the middle of the viewport.
        const angles = [16, 0, -16];
        gsap.utils.toArray<HTMLElement>(".js-vv-card").forEach((card, i) => {
          gsap.to(card, {
            yPercent: speeds[i],
            ease: "none",
            scrollTrigger: {
              trigger: ".js-vv-grid",
              start: "top bottom",
              end: "bottom top",
              scrub: 1.2,
            },
          });
          if (angles[i]) {
            gsap.fromTo(
              card,
              { rotationY: angles[i] },
              {
                rotationY: 0,
                ease: "none",
                scrollTrigger: {
                  trigger: ".js-vv-grid",
                  start: "top bottom",
                  end: "center center",
                  scrub: 1,
                },
              },
            );
          }
        });

        // The red glow floats up slowly behind everything.
        gsap.to(".js-vv-glow", {
          yPercent: -30,
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top bottom",
            end: "bottom top",
            scrub: 2,
          },
        });
      });
    },
    { scope: root, dependencies: [reduced] },
  );

  return (
    <section
      ref={root}
      id="lyric-videos"
      className="js-vv-section relative scroll-mt-20 overflow-hidden bg-void px-6 py-24 sm:px-8 md:py-36"
    >
      {/* Ambient backdrop: drifting ghost word + floating red glow */}
      <div
        aria-hidden
        className="js-vv-word pointer-events-none absolute left-0 top-[8%] w-full select-none whitespace-nowrap text-center text-[clamp(5rem,18vw,15rem)] font-medium leading-none tracking-[-0.04em] text-white/[0.025]"
      >
        LYRIC&nbsp;VIDEOS&nbsp;LYRIC&nbsp;VIDEOS
      </div>
      <div
        aria-hidden
        className="js-vv-glow pointer-events-none absolute left-1/2 top-1/2 h-[700px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,45,45,0.07),transparent)]"
      />

      <div className="relative z-[2] mx-auto max-w-[1200px]">
        <div className="js-vv-head mx-auto mb-16 max-w-[680px] text-center md:mb-24">
          <p className="mb-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-[3px] text-pulse/70">
            <Clapperboard className="h-3.5 w-3.5" />
            One step further
          </p>
          <h2 className="mb-5 text-[clamp(1.9rem,4.5vw,42px)] font-medium leading-[1.1] tracking-[-1.6px] text-white">
            Then watch your lyrics
            <br />
            <span className="hero-accent">become a film.</span>
          </h2>
          <p className="mx-auto max-w-[520px] text-[17px] leading-[1.6] text-white/55">
            Once your lyrics are synced, Syllary goes one step further — directing a full
            lyric video from your track in a few clicks. Pick a style, pick a look, done.
          </p>
        </div>

        <div className="js-vv-grid grid grid-cols-1 gap-10 [perspective:1400px] md:grid-cols-3 md:gap-6 lg:gap-8">
          {STYLES.map((style, i) => (
            <article
              key={style.model}
              className="js-vv-card group relative"
              data-style={style.model}
            >
              {/* Static diagonal stagger on desktop; parallax levels it out mid-scroll.
                  This wrapper also provides the perspective for the hover tilt. */}
              <div
                className={`[perspective:900px] ${
                  i === 1 ? "lg:mt-16" : i === 2 ? "lg:mt-32" : ""
                }`}
              >
                <TiltCard className="relative overflow-hidden rounded-[18px] border-[0.5px] border-white/[0.09] bg-stage shadow-[0_30px_60px_rgba(0,0,0,0.5)] transition-[border-color,box-shadow] duration-500 group-hover:border-pulse/40 group-hover:shadow-[0_30px_70px_rgba(0,0,0,0.6),0_0_50px_rgba(255,45,45,0.12)]">
                  <div className="relative aspect-video w-full overflow-hidden bg-black">
                    <PreviewLoop model={style.model} />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                    <span className="absolute left-4 top-4 font-mono text-[12px] tracking-[2px] text-white/40">
                      {style.index}
                    </span>
                    <span className="absolute bottom-3 right-4">
                      <MotionMeter level={style.motion} />
                    </span>
                  </div>

                  <div className="p-6">
                    <h3 className="mb-1 text-[19px] font-medium tracking-[-0.4px] text-white">
                      {style.label}
                    </h3>
                    <p className="mb-3 text-[12px] uppercase tracking-[1.5px] text-pulse/80">
                      {style.tagline}
                    </p>
                    <p className="text-[14px] leading-[1.65] text-white/50">{style.copy}</p>
                  </div>
                </TiltCard>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-16 text-center md:mt-24">
          <a
            href="#upload"
            className="inline-flex items-center gap-2.5 rounded-[12px] bg-pulse px-7 py-3.5 text-[15px] font-medium text-white shadow-[0_8px_30px_rgba(255,45,45,0.35)] transition-transform hover:scale-[1.04]"
          >
            Make one with your track
            <ArrowRight className="h-4 w-4" />
          </a>
          <p className="mt-4 text-[13px] text-white/35">
            1080p MP4 · synced to the beat · rendered in minutes
          </p>
        </div>
      </div>
    </section>
  );
}
