"use client";

import Link from "next/link";
import { useState } from "react";
import { useShop } from "./shop-state";

/** Heart on product cards and pages. Works for guests (kept on this device). */
export function SaveButton({ listingId, className = "" }: { listingId: string; className?: string }) {
  const { isSaved, toggleSave } = useShop();
  const saved = isSaved(listingId);
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save"}
      onClick={(e) => {
        e.preventDefault(); // cards are links
        e.stopPropagation();
        void toggleSave(listingId);
      }}
      className={`flex size-9 items-center justify-center rounded-full bg-surface text-lg shadow-sm ${className}`}
    >
      <span aria-hidden="true" className={saved ? "text-danger" : "text-muted"}>
        {saved ? "♥" : "♡"}
      </span>
    </button>
  );
}

const BAG_ERRORS: Record<string, string> = {
  BAG_FULL: "Your bag is full (30 pieces). Check out or remove something first.",
  NOT_FOUND: "This piece isn't available.",
};

/** "Add to bag" on product pages. Adding never reserves the piece. */
export function AddToBagButton({ listingId }: { listingId: string }) {
  const { inBag, addToBag } = useShop();
  const [error, setError] = useState<string | null>(null);
  if (inBag(listingId)) {
    return (
      <Link href="/bag" className="block w-full rounded-full border border-foreground py-3 text-center font-semibold">
        In your bag · View bag
      </Link>
    );
  }
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={async () => {
          const r = await addToBag(listingId);
          setError(r.ok ? null : (BAG_ERRORS[r.error ?? ""] ?? "Couldn't add to bag."));
        }}
        className="w-full rounded-full border border-foreground py-3 font-semibold"
      >
        Add to bag
      </button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

/** Header link with the bag count. */
export function BagLink() {
  const { bagCount } = useShop();
  return (
    <Link href="/bag" className="text-sm hover:underline" aria-label={`Bag, ${bagCount} ${bagCount === 1 ? "piece" : "pieces"}`}>
      Bag{bagCount > 0 && <span className="ml-1 rounded-full bg-foreground px-1.5 text-xs text-background">{bagCount}</span>}
    </Link>
  );
}
