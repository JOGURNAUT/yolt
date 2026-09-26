"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Shipment = { awb: string; courierName: string; labelUrl: string | null; status: string } | null;

const ERRORS: Record<string, string> = {
  PICKUP_ADDRESS_MISSING: "Add your pickup address in store settings before booking a pickup.",
  ALREADY_BOOKED: "A pickup is already booked for this order.",
  NOT_CONFIRMED: "This order can't be shipped.",
  NOT_CANCELLABLE: "The courier already has this parcel, so it can't be cancelled.",
  SHIPPING_UNAVAILABLE: "Courier booking is unavailable right now. Try again in a few minutes.",
};

export function SellerOrderActions({ orderId, status, shipment, devShipping }: { orderId: string; status: string; shipment: Shipment; devShipping: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

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

  const canCancel = status === "CONFIRMED" || (status === "PACKED" && shipment?.status === "BOOKED");

  return (
    <section className="space-y-3">
      {status === "CONFIRMED" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => call(`/api/seller/orders/${orderId}/ship`)}
          className="w-full rounded-full bg-foreground py-3 font-semibold text-background disabled:opacity-60 sm:w-auto sm:px-8"
        >
          {busy ? "Booking…" : "Packed — book pickup"}
        </button>
      )}

      {shipment && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-3 text-sm">
          <span>
            {shipment.courierName} · AWB <span className="font-mono">{shipment.awb}</span>
          </span>
          {shipment.labelUrl && status === "PACKED" && (
            <a href={shipment.labelUrl} target="_blank" rel="noopener" className="rounded-full border border-line px-3 py-1 hover:border-foreground">
              Print label
            </a>
          )}
          {devShipping && !["DELIVERED", "RTO", "CANCELLED"].includes(shipment.status) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => call(`/api/dev/shipments/${shipment.awb}/advance`, {})}
              className="rounded-full border border-dashed border-line px-3 py-1 text-muted"
            >
              Dev: next courier scan
            </button>
          )}
        </div>
      )}

      {canCancel &&
        (cancelling ? (
          <form
            className="space-y-2 rounded-lg border border-line p-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await call(`/api/seller/orders/${orderId}/cancel`, { reason })) setCancelling(false);
            }}
          >
            <label className="block text-sm">
              <span className="font-medium">Why can&apos;t you send it?</span>
              <textarea
                className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2"
                value={reason}
                minLength={3}
                maxLength={300}
                required
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <p className="text-xs text-muted">The buyer gets a full refund. The item is taken off sale; you can relist it later.</p>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="rounded-full bg-danger px-4 py-2 text-sm font-semibold text-background disabled:opacity-60">
                Cancel order
              </button>
              <button type="button" onClick={() => setCancelling(false)} className="rounded-full border border-line px-4 py-2 text-sm">
                Keep order
              </button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setCancelling(true)} className="text-sm text-muted underline">
            I can&apos;t send this order
          </button>
        ))}

      <p role="alert" aria-live="polite" className="text-sm text-danger">
        {error}
      </p>
    </section>
  );
}
