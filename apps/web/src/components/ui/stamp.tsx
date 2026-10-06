import { cx } from "./cx";

/** Stamp (board C2), e.g. "Live now". `wobble` plays once when it appears (not under reduced motion). */
export function Stamp({
  dot = false,
  wobble = false,
  className,
  children,
}: {
  dot?: boolean;
  wobble?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cx("stamp", wobble && "wobble", className)}>
      {dot && <span className="dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
