"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui/button";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(
    new Date(iso),
  );

/** Buyer protection: if the seller hasn't shipped 48 h after the deadline, cancel for a full refund. */
export function LateCancelButton({ orderId, availableAt, totalLabel }: { orderId: string; availableAt: string; totalLabel?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Decided once on mount; the page re-renders after cancelling.
  const [available] = useState(() => Date.now() >= new Date(availableAt).getTime());

  if (!available) {
    return <p className="t-small muted">If it hasn&apos;t shipped by {when(availableAt)} IST, you can cancel here for a full refund.</p>;
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
    <div className="card flex flex-col gap-3 p-4 shadow-[inset_0_0_0_2px_var(--foreground)]">
      <p className="t-small font-semibold">The seller hasn&apos;t shipped this order in time. It&apos;s been more than 48 h past the dispatch date, so you can cancel for a full refund{totalLabel ? ` of ${totalLabel}` : ""}.</p>
      <Button size="lg" block loading={busy} onClick={cancel}>
        Cancel and refund me
      </Button>
      {error && (
        <p role="alert" className="help err">
          {error}
        </p>
      )}
    </div>
  );
}
