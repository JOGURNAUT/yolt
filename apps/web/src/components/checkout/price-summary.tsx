import { formatINR } from "@/lib/format";

/**
 * PriceSummary (boards Checkout, Order): items, shipping or Free, total. There is no fee line:
 * buyers never pay one (decision D13).
 */
export function PriceSummary({
  itemCount,
  subtotalPaise,
  shippingPaise,
  totalPaise,
  totalLabel = "Total",
}: {
  itemCount: number;
  subtotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
  totalLabel?: string;
}) {
  return (
    <dl className="m-0 flex flex-col gap-2">
      <div className="t-body flex justify-between">
        <dt>{itemCount === 1 ? "Item" : `Items (${itemCount})`}</dt>
        <dd className="m-0">{formatINR(subtotalPaise)}</dd>
      </div>
      <div className="t-body flex justify-between">
        <dt>Shipping</dt>
        <dd className="m-0">{shippingPaise ? formatINR(shippingPaise) : "Free"}</dd>
      </div>
      <div className="flex justify-between border-t border-dashed border-line pt-2">
        <dt className="t-h3">{totalLabel}</dt>
        <dd className="t-h3 m-0">{formatINR(totalPaise)}</dd>
      </div>
    </dl>
  );
}
