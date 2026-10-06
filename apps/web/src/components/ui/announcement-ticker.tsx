import { Sparkle } from "lucide-react";
import { cx } from "./cx";

/**
 * AnnouncementTicker (board C3): a slow 28 px marquee of real facts only. It pauses on hover,
 * focus and touch, and stops under reduced motion (see yolt.css). The marquee loops by sliding
 * half its track, so the facts are written twice (enough times to fill a wide screen); only the
 * first copy is read out.
 */
export function AnnouncementTicker({ items, className }: { items: string[]; className?: string }) {
  if (items.length === 0) return null;
  const set = Array.from({ length: Math.ceil(4 / items.length) }, () => items).flat();
  return (
    <div role="region" aria-label="Announcements" className={cx("ticker", className)}>
      <div className="track">
        {[0, 1].flatMap((copy) =>
          set.map((t, i) => (
            <span key={`${copy}-${i}`} className="item" aria-hidden={copy === 1 || undefined}>
              <Sparkle aria-hidden className="ic ic-14" fill="currentColor" stroke="none" />
              {t}
            </span>
          )),
        )}
      </div>
    </div>
  );
}
