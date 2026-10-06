"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useShop } from "./shop-state";
import { Button } from "./ui/button";

export function BagRemoveButton({ listingId }: { listingId: string }) {
  const { removeFromBag } = useShop();
  return (
    <button type="button" onClick={() => removeFromBag(listingId)} className="btn btn-sm btn-ghost !h-11 !p-0">
      Remove
    </button>
  );
}

/** Checks out one store's buyable items through the normal reserve-then-pay flow. */
export function BagCheckoutButton({ listingIds, storeName }: { listingIds: string[]; storeName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        size="lg"
        block
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ listingIds }) });
          const body = (await res.json().catch(() => ({}))) as { orderId?: string; error?: string };
          if (res.ok && body.orderId) return router.push(`/checkout/${body.orderId}`);
          setBusy(false);
          setError(
            body.error === "UNAVAILABLE"
              ? "Someone just reserved one of these. Your bag has been updated; check the rest out again."
              : "Couldn't start checkout. Try again.",
          );
          router.refresh();
        }}
      >
        Check out from {storeName}
      </Button>
      {error && (
        <p role="alert" className="help err">
          {error}
        </p>
      )}
    </div>
  );
}
