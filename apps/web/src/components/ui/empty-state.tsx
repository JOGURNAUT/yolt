import { cx } from "./cx";
import { HangTag } from "./hang-tag";

/** EmptyState (board C2): hang tag, title, one line, one action. */
export function EmptyState({
  tag = "₹0",
  title,
  children,
  action,
  className,
}: {
  tag?: string;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("card flex flex-col items-center gap-3 p-7 text-center", className)}>
      <span aria-hidden="true">
        <HangTag size="lg" ink className="-rotate-4">
          {tag}
        </HangTag>
      </span>
      <p className="t-h1">{title}</p>
      {children && <p className="t-body muted max-w-[360px]">{children}</p>}
      {action}
    </div>
  );
}
