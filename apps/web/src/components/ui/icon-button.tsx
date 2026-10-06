import Link from "next/link";
import { cx } from "./cx";

type Style = { plain?: boolean; count?: number };

function Inner({ count, children }: { count?: number; children: React.ReactNode }) {
  return (
    <>
      {children}
      {count !== undefined && count > 0 && (
        <span className="count" aria-hidden="true">
          {count}
        </span>
      )}
    </>
  );
}

/**
 * IconButton (board C1): a 44 px round target. Outlined by default, `plain` without the ring.
 * The label must say what the count means (e.g. "Bag, 2 pieces"); the badge itself is hidden.
 */
export function IconButton({
  label,
  plain = false,
  count,
  className,
  children,
  type = "button",
  ...props
}: Style & { label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} aria-label={label} className={cx("iconbtn", plain && "is-plain", className)} {...props}>
      <Inner count={count}>{children}</Inner>
    </button>
  );
}

export function IconLink({
  label,
  plain = false,
  count,
  className,
  children,
  ...props
}: Style & { label: string } & React.ComponentProps<typeof Link>) {
  return (
    <Link aria-label={label} className={cx("iconbtn", plain && "is-plain", className)} {...props}>
      <Inner count={count}>{children}</Inner>
    </Link>
  );
}
