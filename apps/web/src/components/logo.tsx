import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /** Bar color. Defaults to Pulse red for dark backgrounds. */
  color?: string;
  /** Hide the dashed timeline (favicon / very small usage). */
  hideTimeline?: boolean;
  title?: string;
};

const BARS = [
  { x: 6, y: 22, h: 12 },
  { x: 12, y: 16, h: 24 },
  { x: 18, y: 10, h: 36 },
  { x: 24, y: 18, h: 20 },
  { x: 30, y: 14, h: 28 },
  { x: 36, y: 20, h: 16 },
  { x: 42, y: 24, h: 8 },
];

/** The "Bargroove" mark: seven spectrum bars over a dashed beat-grid timeline. */
export function LogoMark({
  className,
  color = "var(--color-pulse)",
  hideTimeline = false,
  title = "Syllary",
}: LogoProps) {
  return (
    <svg
      viewBox="0 0 56 56"
      fill="none"
      role="img"
      aria-label={title}
      className={cn("h-6 w-6", className)}
    >
      {BARS.map((bar) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={bar.y}
          width={3}
          height={bar.h}
          rx={1.5}
          fill={color}
        />
      ))}
      {!hideTimeline && (
        <line
          x1={3}
          y1={50}
          x2={48}
          y2={50}
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray="2 3"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** Mark + wordmark lockup for nav and footer. */
export function LogoWordmark({
  className,
  color = "var(--color-pulse)",
}: Pick<LogoProps, "className" | "color">) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark color={color} className="h-6 w-6" />
      <span className="text-[17px] font-medium tracking-[-0.4px] text-foreground">
        syllary
      </span>
    </span>
  );
}
