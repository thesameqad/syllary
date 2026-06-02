import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary";

const VARIANT: Record<Variant, string> = {
  // Glossy red with an inset top highlight + colored drop shadow for depth.
  primary:
    "bg-gradient-to-b from-[#ff5151] to-[#d81818] text-white shadow-[0_10px_28px_-8px_rgba(255,45,45,0.65),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-2px_6px_rgba(120,0,0,0.45)]",
  secondary:
    "border border-white/10 bg-white/[0.05] text-white/80 shadow-[0_8px_20px_-10px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.1)] hover:text-white hover:border-white/20",
};

/** A button with a tactile 3D feel: it tilts and lifts toward the cursor on
 *  hover and presses inward on tap. Used across the lyric-video flow so even
 *  the buttons feel dimensional. */
export function Button3D({
  children,
  onClick,
  disabled = false,
  type = "button",
  variant = "primary",
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  variant?: Variant;
  className?: string;
}) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{ transformPerspective: 700, transformStyle: "preserve-3d" }}
      whileHover={disabled ? undefined : { y: -2.5, rotateX: -7, scale: 1.025 }}
      whileTap={disabled ? undefined : { y: 0, rotateX: 0, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 420, damping: 24 }}
      className={cn(
        "relative inline-flex select-none items-center justify-center gap-2 rounded-full px-6 py-2.5 text-[14px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        VARIANT[variant],
        className,
      )}
    >
      {children}
    </motion.button>
  );
}
