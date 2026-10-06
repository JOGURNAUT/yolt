"use client";

import { useState } from "react";
import { BuyButton } from "@/components/buy-button";
import { AddToBagButton, SaveButton } from "@/components/shop-buttons";
import { Button, ButtonLink } from "@/components/ui/button";

export type ProductState = "available" | "reserved" | "sold" | "soon";

/**
 * The product page's actions (board Product): a sticky bar above the bottom nav on phones, a row
 * in the right column on desktop. Which buttons show depends on the piece: only an available one
 * can be bought, reserved can still be saved, sold out has no save and offers similar pieces, and
 * coming soon sends you to its drop.
 */
export function ProductActions({
  state,
  listingId,
  pricePaise,
  category,
  storeHandle,
  storeName,
  dropId,
}: {
  state: ProductState;
  listingId: string;
  pricePaise: number;
  category: string;
  storeHandle: string;
  storeName: string;
  dropId: string | null;
}) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div
      aria-label="Actions"
      role="group"
      className="fixed inset-x-0 bottom-[var(--bnav-h)] z-30 flex flex-col gap-1.5 bg-surface px-4 pb-3 pt-2.5 shadow-[inset_0_1px_0_var(--line)] lg:static lg:z-auto lg:bg-transparent lg:p-0 lg:shadow-none"
    >
      <p role="status" aria-live="polite" className="t-small text-danger empty:hidden">
        {message}
      </p>
      <div className="flex items-center gap-2 lg:gap-2.5">
        {state === "available" && (
          <>
            <SaveButton listingId={listingId} variant="bar" />
            <AddToBagButton listingId={listingId} size="md" onError={setMessage} className="flex-1 lg:[&_.btn]:h-14 lg:[&_.btn]:text-base" />
            <BuyButton listingId={listingId} pricePaise={pricePaise} size="md" onMessage={setMessage} className="!flex-[1.4] lg:!h-14 lg:!text-base" />
          </>
        )}
        {state === "reserved" && (
          <>
            <SaveButton listingId={listingId} variant="bar" />
            <Button size="md" disabled className="flex-1 lg:!h-14">
              Reserved right now
            </Button>
          </>
        )}
        {state === "soon" && (
          <>
            <SaveButton listingId={listingId} variant="bar" />
            {dropId && (
              <ButtonLink href={`/d/${dropId}`} size="md" className="flex-1 lg:!h-14">
                Go to the drop
              </ButtonLink>
            )}
          </>
        )}
        {state === "sold" && (
          <div className="flex flex-1 flex-col gap-1.5">
            <ButtonLink href={`/search?cat=${category}`} size="md" block className="lg:!h-14">
              Find similar pieces
            </ButtonLink>
            <ButtonLink href={`/s/${storeHandle}`} variant="ghost" size="sm" block className="!h-11">
              See what&apos;s in stock at {storeName}
            </ButtonLink>
          </div>
        )}
      </div>
      {state === "available" && <p className="t-small muted hidden lg:block">Items in your bag aren&apos;t reserved. Unique pieces can sell.</p>}
    </div>
  );
}
