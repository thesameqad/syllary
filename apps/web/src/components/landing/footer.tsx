import { LogoMark } from "@/components/logo";

export function Footer() {
  return (
    <footer className="flex flex-col items-center justify-between gap-3 border-t border-white/[0.04] px-6 py-[18px] sm:flex-row sm:px-8">
      <div className="flex items-center gap-2 text-[11px] text-white/30">
        <LogoMark color="#ffffff" hideTimeline className="h-3.5 w-3.5 opacity-60" />
        <span>© 2026 Syllary</span>
      </div>
      <nav className="flex items-center gap-4 text-[11px] text-white/25">
        <a href="#terms" className="transition-colors hover:text-white/60">
          Terms
        </a>
        <a href="#privacy" className="transition-colors hover:text-white/60">
          Privacy
        </a>
        <a href="#contact" className="transition-colors hover:text-white/60">
          Contact
        </a>
      </nav>
    </footer>
  );
}
