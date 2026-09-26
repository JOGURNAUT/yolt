"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const MESSAGES: Record<string, string> = {
  BUYER_CHECKING_OUT: "A buyer is paying for this right now. Try again in a few minutes.",
  NOT_AVAILABLE: "This item isn't live any more.",
};

export function ListingActions({ listingId, status, slug }: { listingId: string; status: string; slug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "sold-elsewhere" | "withdraw", confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/seller/listings/${listingId}/${action}`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(MESSAGES[body.error ?? ""] ?? "Something went wrong.");
    }
    router.refresh();
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
      <div className="flex gap-3">
        {status === "AVAILABLE" && (
          <Link href={`/p/${slug}`} className="text-muted hover:underline">
            View
          </Link>
        )}
        {["DRAFT", "AVAILABLE", "WITHDRAWN"].includes(status) && (
          <Link href={`/seller/listings/${listingId}`} className="hover:underline">
            Edit
          </Link>
        )}
        {status === "AVAILABLE" && (
          <>
            <button type="button" disabled={busy} onClick={() => act("sold-elsewhere", "Mark as sold on Instagram or in person? It moves to Sold out and can't be bought here.")} className="hover:underline">
              Sold elsewhere
            </button>
            <button type="button" disabled={busy} onClick={() => act("withdraw", "Take this item off sale? You can relist it later.")} className="text-muted hover:underline">
              Withdraw
            </button>
          </>
        )}
      </div>
      {error && <p role="alert" className="max-w-56 text-right text-xs text-danger">{error}</p>}
    </div>
  );
}
