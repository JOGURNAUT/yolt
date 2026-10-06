import { Box, Check, CreditCard, Home, Truck, X, Clock, Undo2 } from "lucide-react";
import { cx } from "../ui/cx";

const when = (d: Date | string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(d));
const day = (d: Date | string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(d));

type Step = { label: string; icon: typeof Check; when: string; state: "done" | "now" | "late" | "todo" };

type Input = {
  status: string;
  confirmedAt: Date | string | null;
  packedAt: Date | string | null;
  shippedAt: Date | string | null;
  deliveredAt: Date | string | null;
  cancelledAt: Date | string | null;
  dispatchBy: Date | string | null;
  late: boolean;
  courierName?: string | null;
};

export function timelineSteps(o: Input): Step[] {
  const cancelled = o.status === "CANCELLED_BY_BUYER" || o.status === "CANCELLED_BY_SELLER";
  if (cancelled) {
    return [
      { label: "Paid", icon: CreditCard, when: o.confirmedAt ? when(o.confirmedAt) : "", state: "done" },
      { label: o.status === "CANCELLED_BY_SELLER" ? "Cancelled by seller" : "Cancelled", icon: X, when: o.cancelledAt ? when(o.cancelledAt) : "", state: "done" },
      { label: "Refund started", icon: Undo2, when: "Back to how you paid", state: "now" },
    ];
  }
  const reached = o.deliveredAt || o.status === "DELIVERED" || o.status === "CLOSED" ? 3 : o.shippedAt || o.status === "SHIPPED" ? 2 : o.packedAt || o.status === "PACKED" ? 1 : 0;
  const base: [string, typeof Check, string][] = [
    ["Paid", CreditCard, o.confirmedAt ? when(o.confirmedAt) : ""],
    ["Packed", Box, o.packedAt ? when(o.packedAt) : o.dispatchBy ? `By ${day(o.dispatchBy)}` : ""],
    ["Shipped", Truck, o.shippedAt ? `${day(o.shippedAt)}${o.courierName ? ` · ${o.courierName}` : ""}` : ""],
    ["Delivered", Home, o.deliveredAt ? when(o.deliveredAt) : ""],
  ];
  return base.map(([label, icon, w], i) => ({
    label,
    icon,
    when: w,
    state: i < reached || (i === 3 && reached === 3) ? "done" : i === reached ? (o.late && reached <= 1 ? "late" : "now") : "todo",
  }));
}

/** OrderTimeline for buyers (board Order): Paid, Packed, Shipped, Delivered, with the step you're on marked in words too. */
export function BuyerTimeline({ steps, horizontal = false }: { steps: Step[]; horizontal?: boolean }) {
  return (
    <ol aria-label="Order progress" className={cx("tl", horizontal && "lg:grid lg:grid-cols-4 lg:gap-3")}>
      {steps.map((s, i) => {
        const Icon = s.icon;
        return (
          <li key={s.label} className={cx("row", `is-${s.state}`)} aria-current={s.state === "now" || s.state === "late" ? "step" : undefined}>
            <span className="rail">
              <span className="dot">{s.state === "late" ? <Clock aria-hidden className="ic ic-16" strokeWidth={2.25} /> : <Icon aria-hidden className="ic ic-16" strokeWidth={2.25} />}</span>
              {i < steps.length - 1 && <span className="line" />}
            </span>
            <span className="flex flex-col gap-0.5 pb-4 pt-[3px]">
              <span className="t-small font-bold">
                {s.label}
                <span className="muted font-semibold">{s.state === "now" ? " · now" : s.state === "late" ? " · late" : s.state === "todo" ? " · next" : ""}</span>
              </span>
              {s.when && <span className="t-small muted">{s.when}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
