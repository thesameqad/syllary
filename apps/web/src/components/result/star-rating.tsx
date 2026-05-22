import { useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import type { RatingSummary } from "@syllary/shared";
import { cn } from "@/lib/utils";

export function StarRating({
  summary,
  canRate,
  onRate,
}: {
  summary: RatingSummary;
  canRate: boolean;
  onRate: (stars: number) => Promise<void>;
}) {
  const [hover, setHover] = useState(0);
  const [saving, setSaving] = useState(false);

  const filled = hover || summary.myRating || Math.round(summary.averageRating);

  async function rate(stars: number) {
    if (!canRate || saving) return;
    setSaving(true);
    try {
      await onRate(stars);
    } finally {
      setSaving(false);
      setHover(0);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={!canRate || saving}
            onMouseEnter={() => canRate && setHover(n)}
            onClick={() => void rate(n)}
            aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
            className={cn(
              "transition-transform",
              canRate ? "hover:scale-110" : "cursor-default",
            )}
          >
            <Star
              className={cn(
                "h-7 w-7 transition-colors",
                n <= filled ? "fill-pulse text-pulse" : "fill-transparent text-white/25",
              )}
            />
          </button>
        ))}
      </div>

      <div className="text-[12px] text-white/50">
        {summary.ratingCount > 0
          ? `${summary.averageRating.toFixed(1)} · ${summary.ratingCount} rating${summary.ratingCount > 1 ? "s" : ""}`
          : "No ratings yet"}
      </div>

      {!canRate ? (
        <Link to="/sign-in" className="text-[12px] text-pulse hover:underline">
          Sign in to rate
        </Link>
      ) : summary.myRating ? (
        <div className="text-[11px] text-white/35">
          Your rating: {summary.myRating}{" "}
          <Star className="inline h-2.5 w-2.5 fill-pulse text-pulse" />
        </div>
      ) : (
        <div className="text-[11px] text-white/35">Tap a star to rate</div>
      )}
    </div>
  );
}
