"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Printer, Truck } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { cx, ICON_STROKE } from "@/components/ui/cx";

type Shipment = { awb: string; courierName: string; labelUrl: string | null; status: string } | null;

const ERRORS: Record<string, string> = {
  PICKUP_ADDRESS_MISSING: "Add your pickup address in store settings before booking a pickup.",
  ALREADY_BOOKED: "A pickup is already booked for this order.",
  NOT_CONFIRMED: "This order can't be shipped.",
  NOT_CANCELLABLE: "The courier already has this parcel, so it can't be cancelled.",
  SHIPPING_UNAVAILABLE: "Courier booking is unavailable right now. Try again in a few minutes.",
};

/** POSTs to the seller API and refreshes the page; returns an error message, or null on success. */
function useCall() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function call(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      setError(ERRORS[b.error ?? ""] ?? "Something went wrong. Try again.");
      return false;
    }
    router.refresh();
    return true;
  }
  return { call, busy, error };
}

/** Book the pickup, then print the label; in development, a button that plays the courier's scans. */
export function SellerOrderActions({ orderId, status, shipment, devShipping }: { orderId: string; status: string; shipment: Shipment; devShipping: boolean }) {
  const { call, busy, error } = useCall();

  return (
    <div className="space-y-3">
      {status === "CONFIRMED" && (
        <Button size="lg" loading={busy} onClick={() => call(`/api/seller/orders/${orderId}/ship`)} className="w-full sm:w-auto sm:px-8">
          <Truck aria-hidden className="ic" strokeWidth={ICON_STROKE} />
          Packed — book pickup
        </Button>
      )}

      {shipment && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-surface-2 p-3.5">
          <span className="t-small">
            <strong>{shipment.courierName}</strong> · AWB <span className="t-mono !text-[13px]">{shipment.awb}</span>
          </span>
          {shipment.labelUrl && status === "PACKED" && (
            <ButtonLink href={shipment.labelUrl} target="_blank" rel="noopener" variant="secondary" size="sm" className="!h-11">
              <Printer aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />
              Print label
            </ButtonLink>
          )}
          {devShipping && !["DELIVERED", "RTO", "CANCELLED"].includes(shipment.status) && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => call(`/api/dev/shipments/${shipment.awb}/advance`, {})}
              className="!h-11 !border !border-dashed !border-muted"
            >
              Dev: next courier scan
            </Button>
          )}
        </div>
      )}

      <p role="alert" aria-live="polite" className={cx("t-small font-semibold text-danger", !error && "hidden")}>
        {error}
      </p>
    </div>
  );
}

/** "Can't send it?": cancel with a reason; the buyer is refunded in full. */
export function CancelOrder({ orderId }: { orderId: string }) {
  const { call, busy, error } = useCall();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <section aria-labelledby="cancel-h" className="card flex flex-col gap-2.5 p-5">
      <h2 id="cancel-h" className="t-h3 !normal-case">
        Can&apos;t send it?
      </h2>
      <p className="t-small muted">Cancel now and the buyer gets a full refund. This counts toward your cancellation rate.</p>
      {cancelling ? (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await call(`/api/seller/orders/${orderId}/cancel`, { reason })) setCancelling(false);
          }}
        >
          <label className="field">
            Why can&apos;t you send it?
            <textarea className="input !h-auto min-h-24 !py-3 !leading-[1.4]" value={reason} minLength={3} maxLength={300} required onChange={(e) => setReason(e.target.value)} />
            <span className="help">The item is taken off sale; you can relist it later. {reason.length} / 300</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" loading={busy}>
              Cancel order
            </Button>
            <Button variant="secondary" onClick={() => setCancelling(false)}>
              Keep order
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="ghost" className="!h-11 self-start !px-0 !text-danger" onClick={() => setCancelling(true)}>
          I can&apos;t send this order
        </Button>
      )}
      <p role="alert" aria-live="polite" className={cx("t-small font-semibold text-danger", !error && "hidden")}>
        {error}
      </p>
    </section>
  );
}
