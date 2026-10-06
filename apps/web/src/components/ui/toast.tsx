import { Check, CircleAlert, Info, X } from "lucide-react";
import { cx, ICON_STROKE } from "./cx";

const ICONS = { success: Check, error: CircleAlert, info: Info } as const;

/**
 * Toast (board C2), presentational. Errors are announced assertively, the rest politely.
 * Placement and timing (4 s, or until dismissed when it has an action) belong to the caller.
 */
export function Toast({
  tone = "info",
  onDismiss,
  action,
  className,
  children,
}: {
  tone?: keyof typeof ICONS;
  onDismiss?: () => void;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const Icon = ICONS[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("toast", className)}>
      <Icon aria-hidden className="ic lead" strokeWidth={ICON_STROKE} />
      <span className="grow">{children}</span>
      {action}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="iconbtn is-plain -my-2.5 -mr-2 text-background">
          <X aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />
        </button>
      )}
    </div>
  );
}
