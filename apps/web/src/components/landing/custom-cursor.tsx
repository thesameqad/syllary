import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

const INTERACTIVE = 'a, button, input, label, [role="button"], [data-cursor="interactive"]';

/**
 * Landing-only magnetic cursor. Renders an 8px outlined dot that grows to a
 * 32px Pulse-filled disc over interactive elements and is gently pulled toward
 * their center. The caller is responsible for not mounting this on touch
 * devices or when reduced motion is requested.
 */
export function CustomCursor() {
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const springX = useSpring(x, { stiffness: 500, damping: 40, mass: 0.3 });
  const springY = useSpring(y, { stiffness: 500, damping: 40, mass: 0.3 });
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      setVisible(true);
      const target = (e.target as Element | null)?.closest(INTERACTIVE) as HTMLElement | null;
      if (target) {
        const r = target.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        x.set(e.clientX + (cx - e.clientX) * 0.3);
        y.set(e.clientY + (cy - e.clientY) * 0.3);
        setHovered(true);
      } else {
        x.set(e.clientX);
        y.set(e.clientY);
        setHovered(false);
      }
    }
    const onLeave = () => setVisible(false);

    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, [x, y]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[100]"
      style={{ x: springX, y: springY, opacity: visible ? 1 : 0 }}
    >
      <motion.div
        className="-translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          borderStyle: "solid",
          mixBlendMode: hovered ? "normal" : "difference",
        }}
        animate={{
          width: hovered ? 32 : 8,
          height: hovered ? 32 : 8,
          backgroundColor: hovered ? "#FF2D2D" : "rgba(255,255,255,0)",
          borderWidth: hovered ? 0 : 1.5,
          borderColor: "rgba(255,255,255,0.6)",
        }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
      />
    </motion.div>
  );
}
