import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Check, ChevronDown, Sparkles, Wand2, Zap } from "lucide-react";
import {
  GENERATION_MODES,
  MODE_INFO,
  MODE_MULTIPLIER,
  type GenerationMode,
} from "@syllary/shared";
import { cn } from "@/lib/utils";

const ICONS: Record<GenerationMode, typeof Zap> = {
  fast: Zap,
  normal: Wand2,
  pro: Sparkles,
};

export function ModeSelector({
  value,
  onChange,
  disabled = false,
  showCostMultiplier = true,
}: {
  value: GenerationMode;
  onChange: (mode: GenerationMode) => void;
  disabled?: boolean;
  /** Show "×N tokens" badges next to each option (hidden in anonymous flow). */
  showCostMultiplier?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const ActiveIcon = ICONS[value];
  const active = MODE_INFO[value];

  // The menu is rendered in a portal (fixed position) so it escapes the landing
  // card's 3D/backdrop-blur context, which otherwise clips the dropdown.
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 8, left: r.left, width: r.width });
    };
    reposition();
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition-colors",
          "hover:border-pulse/60 hover:bg-white/[0.05]",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#FF2D2D]/15 to-[#FF2D2D]/5 text-pulse">
            <ActiveIcon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] font-medium text-white">
              {active.label} <span className="text-white/40">— {active.tagline}</span>
            </span>
            <span className="block truncate text-[11px] text-white/45">{active.eta}</span>
          </span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-white/50 transition-transform", open && "rotate-180")}
        />
      </button>

      {open &&
        pos &&
        createPortal(
          <motion.ul
            ref={menuRef}
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12 }}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="z-[80] overflow-hidden rounded-[12px] border border-white/10 bg-[#141414] shadow-[0_20px_60px_rgba(0,0,0,0.65)]"
          >
            {GENERATION_MODES.map((mode) => {
              const info = MODE_INFO[mode];
              const Icon = ICONS[mode];
              const selected = mode === value;
              return (
                <li key={mode}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(mode);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 p-3 text-left transition-colors",
                      selected ? "bg-pulse/8" : "hover:bg-white/[0.04]",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                        selected
                          ? "bg-gradient-to-br from-pulse to-[#8B0000] text-white shadow-[0_4px_16px_rgba(255,45,45,0.4)]"
                          : "bg-white/[0.04] text-white/70",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-white">{info.label}</span>
                        <span className="text-[11px] text-white/40">{info.tagline}</span>
                        {showCostMultiplier && (
                          <span className="ml-auto rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-white/65">
                            ×{MODE_MULTIPLIER[mode]} tokens
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-[12px] leading-snug text-white/55">
                        {info.description}
                      </span>
                      <span className="mt-1 block text-[11px] text-white/35">{info.eta}</span>
                    </span>
                    {selected && (
                      <Check className="ml-1 mt-1 h-4 w-4 shrink-0 text-pulse" />
                    )}
                  </button>
                </li>
              );
            })}
          </motion.ul>,
          document.body,
        )}
    </div>
  );
}
