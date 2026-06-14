import { useEffect, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { Footer } from "./footer";
import { Hero } from "./hero";
import { LivePreview } from "./live-preview";
import { LyricVideoShowcase } from "./lyric-video-showcase";
import { Nav } from "./nav";
import { Pricing } from "./pricing";

gsap.registerPlugin(ScrollTrigger);

export function LandingPage() {
  const root = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();

  // On a fresh load with a hash (e.g. /#pricing from an ad sitelink, nav, or a
  // direct link), the section doesn't exist yet when the browser does its native
  // scroll — so it lands at the top. Scroll to it once the page has rendered.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const t = setTimeout(() => {
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }, 350);
    return () => clearTimeout(t);
  }, [reduced]);

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
      className="relative w-full max-w-full overflow-x-hidden bg-void text-white"
    >
      <Nav />
      <Hero />
      <LivePreview />
      <LyricVideoShowcase />
      <Pricing />
      <Footer />
    </main>
  );
}
