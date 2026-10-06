import { BadgeCheck } from "lucide-react";
import { cx, ICON_STROKE } from "./cx";

/** "Identity verified" (board C4): PAN and bank were checked. It never means the items are authenticated. */
export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 font-bold", className)}>
      <BadgeCheck aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} style={{ fill: "var(--accent)" }} />
      Identity verified
    </span>
  );
}
