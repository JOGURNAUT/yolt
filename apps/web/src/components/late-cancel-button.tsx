"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(
    new Date(iso),
  );

/** Buyer protection: if the seller hasn't shipped 48 h after the deadline, cancel for a full refund. */
export function LateCancelButton({ orderId, availableAt }: { orderId: string; availableAt: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Decided once on mount; the page re-renders after cancelling.
  const [available] = useState(() => Date.now() >= new Date(availableAt).getTime());

  if (!available) {
    return <p className="text-xs text-muted">If it hasn&apos;t shipped by {when(availableAt)} IST, you can cancel here for a full refund.</p>;
  }

  async function cancel() {
    if (!window.confirm("Cancel this order? You'll get a full refund.")) return;
    setBusy(true);
    const res = await fetch(`/api/orders/${orderId}/cancel-late`, { method: "POST" });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError("Couldn't cancel. The parcel may already be on its way.");
  }

  return (
    <div className="space-y-1 rounded-lg border border-line p-3 text-sm">
      <p>The seller hasn&apos;t shipped this order in time. You can cancel for a full refund.</p>
      <button type="button" disabled={busy} onClick={cancel} className="rounded-full border border-line px-4 py-2 font-medium hover:border-foreground disabled:opacity-60">
        {busy ? "Cancelling…" : "Cancel and refund me"}
      </button>
      <p role="alert" className="text-danger">
        {error}
      </p>
    </div>
  );
}
