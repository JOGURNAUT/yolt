import { Check, CircleAlert, Clock, LoaderCircle, Undo2 } from "lucide-react";
import { cx, ICON_STROKE } from "../ui/cx";
import { HangTag } from "../ui/hang-tag";
import { StatusBadge, type BadgeTone } from "../ui/status-badge";

export type StatusKind = "processing" | "success" | "failed" | "expired" | "left" | "refund";

const BADGES: Record<StatusKind, { tone: BadgeTone; label: string; icon: typeof Check }> = {
  processing: { tone: "reserved", label: "Processing", icon: LoaderCircle },
  success: { tone: "available", label: "Paid", icon: Check },
  failed: { tone: "danger", label: "Payment failed", icon: CircleAlert },
  expired: { tone: "neutral", label: "Reservation ended", icon: Clock },
  left: { tone: "neutral", label: "Left checkout", icon: Undo2 },
  refund: { tone: "reserved", label: "Refund started", icon: Undo2 },
};

/**
 * PaymentStatus (boards CheckoutProcessing, Confirmation, CheckoutFailed, CheckoutExpired,
 * CheckoutLeft, CheckoutRefund): one outcome per screen, always a badge with words, one headline,
 * one line of why, and the next step.
 */
export function PaymentStatus({
  kind,
  title,
  body,
  big = false,
  children,
}: {
  kind: StatusKind;
  title: string;
  body?: React.ReactNode;
  /** The big display headline, for the success screen. */
  big?: boolean;
  children?: React.ReactNode;
}) {
  const badge = BADGES[kind];
  const Icon = badge.icon;
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 pt-10 text-center">
      {kind === "processing" && (
        <span aria-hidden="true" className="flex size-[72px] items-center justify-center rounded-full bg-surface-2">
          <LoaderCircle className="ic ic-24 spin" strokeWidth={ICON_STROKE} />
        </span>
      )}
      {kind === "success" && (
        <span aria-hidden="true">
          <HangTag size="lg" ink className="-rotate-[8deg]">
            Yours
          </HangTag>
        </span>
      )}
      <StatusBadge tone={badge.tone}>
        <Icon aria-hidden className={cx("ic ic-14", kind === "processing" && "spin")} strokeWidth={ICON_STROKE} />
        {badge.label}
      </StatusBadge>
      <h2 role="status" className={big ? "t-display" : "t-h2"}>
        {title}
      </h2>
      {body && <p className="t-body muted">{body}</p>}
      {children}
    </div>
  );
}
