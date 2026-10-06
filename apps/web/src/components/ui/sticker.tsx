import { cx } from "./cx";

/** Sticker (board C2): a die-cut label on photos. One per card at most. */
export function Sticker({
  tone = "accent",
  tilt = "left",
  className,
  children,
}: {
  tone?: "accent" | "ink" | "pink" | "paper";
  tilt?: "left" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  return <span className={cx("sticker", tone !== "accent" && tone, tilt === "right" && "tilt-r", className)}>{children}</span>;
}
