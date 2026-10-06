import type { BadgeTone } from "../ui/status-badge";

/** Badge and headline for an order's state, in the board's words. Always text, never colour alone. */
export function orderBadge(status: string, overdue = false): { tone: BadgeTone; label: string } {
  if (overdue) return { tone: "reserved", label: "Late to ship" };
  switch (status) {
    case "CONFIRMED":
      return { tone: "available", label: "Confirmed" };
    case "PACKED":
      return { tone: "available", label: "Packed" };
    case "SHIPPED":
      return { tone: "soon", label: "Shipped" };
    case "DELIVERED":
      return { tone: "available", label: "Delivered" };
    case "CLOSED":
      return { tone: "available", label: "Complete" };
    case "CANCELLED_BY_BUYER":
    case "CANCELLED_BY_SELLER":
      return { tone: "neutral", label: "Refunded" };
    case "NEEDS_REFUND":
      return { tone: "reserved", label: "Refund started" };
    default:
      return { tone: "neutral", label: "Awaiting payment" };
  }
}

export const IN_PROGRESS = ["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "NEEDS_REFUND"];
