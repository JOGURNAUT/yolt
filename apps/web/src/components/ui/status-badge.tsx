import { cx } from "./cx";

/**
 * StatusBadge (board C2). Always a word, never colour alone. Order and claim states reuse the
 * shapes: available = Paid / Delivered / Refunded, reserved = Pending / Open,
 * danger = Failed / Rejected, neutral = Withdrawn / Cancelled.
 */
export type BadgeTone = "available" | "reserved" | "soldout" | "soon" | "removed" | "danger" | "neutral";

export function StatusBadge({ tone, className, children }: { tone: BadgeTone; className?: string; children: React.ReactNode }) {
  return <span className={cx("badge", tone, className)}>{children}</span>;
}

/** The badge for a listing's status, or null for statuses that don't show one. */
export function listingBadge(status: string): { tone: BadgeTone; label: string } | null {
  switch (status) {
    case "AVAILABLE":
      return { tone: "available", label: "Available" };
    case "RESERVED":
    case "PAYMENT_PENDING":
      return { tone: "reserved", label: "Reserved" };
    case "SOLD":
    case "SOLD_ELSEWHERE":
      return { tone: "soldout", label: "Sold out" };
    case "SCHEDULED":
      return { tone: "soon", label: "Coming soon" };
    case "WITHDRAWN":
      return { tone: "removed", label: "Removed" };
    default:
      return null;
  }
}
