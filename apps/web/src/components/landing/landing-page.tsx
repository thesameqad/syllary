import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";
import { useMediaQuery, usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { CustomCursor } from "./custom-cursor";
import { Footer } from "./footer";
import { Hero } from "./hero";
import { LivePreview } from "./live-preview";
import { Nav } from "./nav";
import { Pricing } from "./pricing";

gsap.registerPlugin(ScrollTrigger);

export function LandingPage() {
  const root = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  const coarsePointer = useMediaQuery("(hover: none)");
  const showCursor = !reduced && !coarsePointer;

  useGSAP(
    () => {
      if (reduced) return;

      gsap.to(".js-hero-content", {
        opacity: 0.3,
        y: -40,
        ease: "none",
        scrollTrigger: { trigger: "#top", start: "top top", end: "bottom top", scrub: true },
      });

      gsap.from(".js-demo-card", {
        y: 80,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
        clearProps: "transform",
        scrollTrigger: { trigger: ".js-demo-card", start: "top 80%" },
      });

      gsap.from(".js-waveform", {
        scaleX: 0,
        transformOrigin: "left center",
        duration: 1.2,
        ease: "power3.out",
        delay: 0.3,
        scrollTrigger: { trigger: ".js-demo-card", start: "top 80%" },
      });

      gsap.from(".js-lyric-line", {
        opacity: 0,
        y: 12,
        duration: 0.5,
        stagger: 0.08,
        ease: "power2.out",
        scrollTrigger: { trigger: ".js-demo-card", start: "top 70%" },
      });

      gsap.from(".js-price-card", {
        y: 60,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: "power3.out",
        clearProps: "transform",
        scrollTrigger: { trigger: "#pricing", start: "top 80%" },
      });

      gsap.fromTo(
        ".js-pricing-grid",
        { rotateX: 4 },
        {
          rotateX: -4,
          ease: "none",
          scrollTrigger: { trigger: "#pricing", start: "top bottom", end: "bottom top", scrub: 1 },
        },
      );
    },
    { scope: root, dependencies: [reduced] },
  );

  return (
    <main
      ref={root}
      className={cn(
        "relative w-full max-w-full overflow-x-hidden bg-void text-white",
        showCursor && "cursor-none-precise",
      )}
    >
      {showCursor && <CustomCursor />}
      <Nav />
      <Hero />
      <LivePreview />
      <Pricing />
      <Footer />
    </main>
  );
}
