import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cx, ICON_STROKE } from "@/components/ui/cx";

/** The title row of a seller page: the h1 on the left, actions wrapping underneath on phones. */
export function PageHeader({
  title,
  kicker,
  actions,
  size = "display",
  className,
}: {
  title: React.ReactNode;
  kicker?: React.ReactNode;
  actions?: React.ReactNode;
  size?: "display" | "h1";
  className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        {kicker && <span className="t-small muted">{kicker}</span>}
        <h1 className={size === "display" ? "t-display" : "t-h1"}>{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

/** "← All listings": the way back from a detail page. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="t-small inline-flex min-h-11 items-center gap-1 font-bold !no-underline hover:!underline" style={{ color: "inherit" }}>
      <ChevronLeft aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />
      {children}
    </Link>
  );
}
