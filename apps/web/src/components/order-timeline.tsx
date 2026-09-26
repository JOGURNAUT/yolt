const LABELS: Record<string, string> = {
  BOOKED: "Pickup booked",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  RTO: "Returning to seller",
  CANCELLED: "Shipment cancelled",
};

const when = (d: Date | string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(d));

export type TimelineEvent = { id: string; status: string; description: string | null; location: string | null; occurredAt: Date | string };

/** Shipment history, newest last. Shared by the buyer and seller order pages. */
export function OrderTimeline({ paidAt, events }: { paidAt: Date | string | null; events: TimelineEvent[] }) {
  return (
    <ol className="space-y-3 border-l border-line pl-4 text-sm">
      {paidAt && (
        <li>
          <p className="font-medium">Paid</p>
          <p className="text-xs text-muted">{when(paidAt)}</p>
        </li>
      )}
      {events.map((e) => (
        <li key={e.id}>
          <p className="font-medium">{LABELS[e.status] ?? e.status}</p>
          <p className="text-xs text-muted">
            {[e.description && e.description !== LABELS[e.status] ? e.description : null, e.location, when(e.occurredAt)].filter(Boolean).join(" · ")}
          </p>
        </li>
      ))}
    </ol>
  );
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  AWAITING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Paid · waiting to be packed",
  PACKED: "Packed · waiting for pickup",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CLOSED: "Completed",
  EXPIRED: "Reservation expired",
  CANCELLED_BY_BUYER: "Cancelled · refunded",
  CANCELLED_BY_SELLER: "Cancelled by seller · refunded",
  NEEDS_REFUND: "Refund in progress",
};
