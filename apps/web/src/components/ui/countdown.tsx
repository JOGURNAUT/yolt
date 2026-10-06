import { cx } from "./cx";

const UNITS = [
  { s: 86_400, long: "days", short: "d", word: "day" },
  { s: 3600, long: "hrs", short: "h", word: "hour" },
  { s: 60, long: "min", short: "m", word: "minute" },
  { s: 1, long: "sec", short: "s", word: "second" },
] as const;

/**
 * Countdown (board C2), presentational: the caller owns the clock (the server's, for drops).
 * Days show only when there are any. Screen readers get the whole time as the timer's label.
 */
export function Countdown({
  ms,
  size = "lg",
  label = "Opens in",
  className,
}: {
  ms: number;
  size?: "lg" | "sm";
  label?: string;
  className?: string;
}) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const parts = UNITS.map((u, i) => ({ ...u, n: Math.floor((i === 0 ? total : total % UNITS[i - 1]!.s) / u.s) })).filter(
    (p, i) => i > 0 || p.n > 0,
  );
  const spoken = parts
    .filter((p) => p.n > 0)
    .map((p) => `${p.n} ${p.word}${p.n === 1 ? "" : "s"}`)
    .join(" ");

  return (
    <span role="timer" aria-label={`${label} ${spoken || "0 seconds"}`} className={cx("cd", size === "sm" && "sm", className)}>
      {parts.map((p) => (
        <span key={p.long} className="cell" aria-hidden="true">
          <span className="num">{String(p.n).padStart(2, "0")}</span>
          <span className="lbl">{size === "sm" ? p.short : p.long}</span>
        </span>
      ))}
    </span>
  );
}
