import { Check } from "lucide-react";
import type { TimelineEvent } from "@/components/order-timeline";

const LABELS: Record<string, string> = {
  BOOKED: "Pickup booked",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  RTO: "Returning to you",
  CANCELLED: "Shipment cancelled",
};

const when = (d: Date | string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(d));

/** The shipment timeline (board SellerOrder): paid, then every courier scan, newest last. */
export function SellerTimeline({ paidAt, events }: { paidAt: Date | string | null; events: TimelineEvent[] }) {
  const steps = [
    ...(paidAt ? [{ id: "paid", label: "Paid", note: when(paidAt) }] : []),
    ...events.map((e) => ({
      id: e.id,
      label: LABELS[e.status] ?? e.status,
      note: [e.description && e.description !== LABELS[e.status] ? e.description : null, e.location, when(e.occurredAt)].filter(Boolean).join(" · "),
    })),
  ];
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {steps.map((s, i) => (
        <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
          {i < steps.length - 1 && <span aria-hidden="true" className="absolute left-[11px] top-6 h-[calc(100%-16px)] w-0.5 bg-foreground" />}
          <span aria-hidden="true" className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
            <Check className="ic ic-14" strokeWidth={3} />
          </span>
          <span className="t-small flex flex-col">
            <strong>{s.label}</strong>
            <span className="muted">{s.note}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
