import { cx } from "./cx";

/** HangTag (board C2): the thrift price tag on its string. Swings straight on card hover. */
export function HangTag({
  size = "md",
  ink = false,
  className,
  children,
}: {
  size?: "md" | "lg";
  ink?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cx("tagwrap", className)}>
      <svg className="string" viewBox="0 0 16 14" aria-hidden="true">
        <path d="M15 12 C 10 10, 6 5, 1 1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span className={cx("hangtag", size === "lg" && "lg", ink && "ink")}>{children}</span>
    </span>
  );
}
