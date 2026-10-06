import { cx } from "../ui/cx";
import { HangTag } from "../ui/hang-tag";

/**
 * SystemPage (boards System, SysError, SysOffline, SysExpired, SysMaintenance, NotFoundDesktop):
 * a hang tag, one headline, one line of why, and the next step. The same device as EmptyState,
 * with the headline as the page's h1.
 */
export function SystemPage({
  tag,
  title,
  children,
  actions,
  className,
}: {
  tag: string;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("mx-auto flex w-full max-w-md flex-col items-center gap-4 py-10 text-center lg:py-16", className)}>
      <span aria-hidden="true">
        <HangTag size="lg" ink className="-rotate-4">
          {tag}
        </HangTag>
      </span>
      <h1 className="t-h1">{title}</h1>
      {children && <div className="t-body muted flex max-w-[360px] flex-col gap-3">{children}</div>}
      {actions && <div className="flex w-full flex-col items-center gap-2.5 pt-2">{actions}</div>}
    </section>
  );
}
