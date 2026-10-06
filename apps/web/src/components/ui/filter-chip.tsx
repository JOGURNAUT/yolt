import Link from "next/link";
import { X } from "lucide-react";
import { cx, ICON_STROKE } from "./cx";

/**
 * FilterChip (board C1): an active filter you can remove with one tap. A link to the same view
 * without that filter, so it works before JavaScript loads. The name says what removing does.
 */
export function FilterChip({ label, href, className, scroll = false }: { label: string; href: string; className?: string; scroll?: boolean }) {
  return (
    <Link href={href} scroll={scroll} aria-label={`Remove filter: ${label}`} className={cx("chip !h-11 shrink-0 !no-underline", className)} style={{ color: "inherit" }}>
      {label}
      <span className="x" aria-hidden="true">
        <X className="ic ic-14" strokeWidth={ICON_STROKE} />
      </span>
    </Link>
  );
}
