"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { formatINR } from "@/lib/format";

export function BuyButton({ listingId, pricePaise }: { listingId: string; pricePaise: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingIds: [listingId], expectedSubtotalPaise: pricePaise }),
      });
      if (res.status === 201) {
        const { orderId } = (await res.json()) as { orderId: string };
        router.push(`/checkout/${orderId}`);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setMessage(
        body.error === "UNAVAILABLE"
          ? "Someone else just reserved this piece. It may come back in a few minutes — try again soon."
          : body.error === "PRICE_CHANGED"
            ? "The price just changed. Check the new price before buying."
            : body.error === "OWN_LISTING"
              ? "This is your own listing."
              : "Something went wrong. Please try again.",
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-line bg-background px-4 py-3 md:static md:mx-0 md:border-0 md:p-0">
      <button
        type="button"
        onClick={buy}
        disabled={busy}
        className="w-full rounded-full bg-foreground py-3 font-semibold text-background disabled:opacity-60"
      >
        {busy ? "Reserving…" : `Buy now · ${formatINR(pricePaise)}`}
      </button>
      <p role="status" aria-live="polite" className="text-sm text-danger">
        {message}
      </p>
    </div>
  );
}
