"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatINR } from "@/lib/format";
import { useShop } from "./shop-state";

export function BagRemoveButton({ listingId }: { listingId: string }) {
  const { removeFromBag } = useShop();
  return (
    <button type="button" onClick={() => removeFromBag(listingId)} className="text-xs text-muted underline">
      Remove
    </button>
  );
}

/** Checks out one store's buyable items through the normal reserve-then-pay flow. */
export function BagCheckoutButton({ listingIds, storeName, totalPaise }: { listingIds: string[]; storeName: string; totalPaise: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ listingIds }) });
          const body = (await res.json().catch(() => ({}))) as { orderId?: string; error?: string };
          setBusy(false);
          if (res.ok && body.orderId) return router.push(`/checkout/${body.orderId}`);
          setError(
            body.error === "UNAVAILABLE"
              ? "Someone just reserved one of these. Your bag has been updated; check the rest out again."
              : "Couldn't start checkout. Try again.",
          );
          router.refresh();
        }}
        className="w-full rounded-full bg-foreground py-3 font-semibold text-background disabled:opacity-60"
      >
        {busy ? "Reserving…" : `Check out ${storeName} · ${formatINR(totalPaise)}`}
      </button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
