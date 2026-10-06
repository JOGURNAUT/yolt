import { Star } from "lucide-react";
import { cx, ICON_STROKE } from "./ui/cx";

/** Read-only star rating (board C5). The whole number is the accessible name; the icons are decoration. */
export function Stars({ rating, size = 16, className = "" }: { rating: number; size?: 14 | 16 | 20; className?: string }) {
  const full = Math.round(rating);
  return (
    <span role="img" aria-label={`${rating.toFixed(1)} out of 5 stars`} className={cx("inline-flex gap-0.5 align-middle", className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden
          width={size}
          height={size}
          strokeWidth={ICON_STROKE}
          className="shrink-0"
          fill={i <= full ? "currentColor" : "none"}
        />
      ))}
    </span>
  );
}
