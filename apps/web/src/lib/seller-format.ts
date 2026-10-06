/** Shown on every "Copy store link" button (brief B8.1). */
export const STORE_LINK_TOOLTIP = "Buyers who come through your link are yours: no commission on their orders.";

const HOUR = 3_600_000;

/** "1 day left", "5 h left" or "Overdue by 3 h", for a dispatch deadline. */
export function timeLeft(deadline: Date | string, now = new Date()) {
  const ms = new Date(deadline).getTime() - now.getTime();
  const abs = Math.abs(ms);
  const span =
    abs >= 24 * HOUR ? `${Math.floor(abs / (24 * HOUR))} ${Math.floor(abs / (24 * HOUR)) === 1 ? "day" : "days"}` : abs >= HOUR ? `${Math.floor(abs / HOUR)} h` : `${Math.max(1, Math.floor(abs / 60_000))} min`;
  return ms >= 0 ? `${span} left` : `Overdue by ${span}`;
}

/** "Fri 3 Oct", in IST, for a date with no time. */
export { formatDay } from "./store-format";

export const CLAIM_REASON_LABELS: Record<string, string> = {
  NOT_AS_DESCRIBED: "Not as described",
  DAMAGED: "Arrived damaged",
  WRONG_ITEM: "Wrong item",
  NOT_RECEIVED: "Never arrived",
};

export const ORDER_BADGE: Record<string, { tone: "available" | "reserved" | "soldout" | "soon" | "removed" | "danger" | "neutral"; label: string }> = {
  CONFIRMED: { tone: "reserved", label: "To pack" },
  PACKED: { tone: "reserved", label: "Awaiting pickup" },
  SHIPPED: { tone: "soon", label: "Shipped" },
  DELIVERED: { tone: "available", label: "Delivered" },
  CLOSED: { tone: "available", label: "Complete" },
  CANCELLED_BY_SELLER: { tone: "removed", label: "Cancelled" },
  CANCELLED_BY_BUYER: { tone: "removed", label: "Cancelled" },
  NEEDS_REFUND: { tone: "danger", label: "Refund in progress" },
};
