import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { connection } from "next/server";
import { getBag } from "@yolt/core";
import { CONDITION_INFO } from "@yolt/shared";
import { BagCheckoutButton } from "@/components/bag-actions";
import { BagLine, BagNote, StoreInitials } from "@/components/bag/bag-line";
import { GuestBag } from "@/components/guest-lists";
import { ProtectionNote } from "@/components/product/detail-blocks";
import { ButtonLink } from "@/components/ui/button";
import { ICON_STROKE } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/format";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Bag", robots: { index: false } };

export default async function BagPage() {
  await connection();
  const user = await getCurrentUser();
  const groups = user ? await getBag(db, user.userId) : null;
  const pieces = groups?.reduce((n, g) => n + g.items.length, 0) ?? 0;

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
      <header className="flex items-baseline gap-4">
        <h1 className="t-display">Bag</h1>
        {groups && groups.length > 0 && (
          <span className="t-small muted">
            {pieces} {pieces === 1 ? "piece" : "pieces"} · {groups.length} {groups.length === 1 ? "store" : "stores"}
          </span>
        )}
      </header>

      {groups && groups.length === 0 ? (
        <EmptyState
          tag="Empty"
          title="Your bag is empty."
          className="mx-auto w-full max-w-md"
          action={
            <div className="flex flex-col items-center gap-1">
              <ButtonLink href="/search">Start exploring</ButtonLink>
              <ButtonLink href="/drops" variant="ghost" size="sm" className="!h-11">
                See upcoming drops
              </ButtonLink>
            </div>
          }
        >
          Every piece here is one of one. Find one that deserves a second life.
        </EmptyState>
      ) : (
        <>
          <BagNote />
          {!groups ? (
            <GuestBag />
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((g) => {
                const buyable = g.items.filter((i) => i.buyable);
                const excluded = g.items.length - buyable.length;
                return (
                  <section key={g.seller.id} aria-label={g.seller.displayName} className="card flex flex-col gap-4 p-4 lg:grid lg:grid-cols-[1fr_340px] lg:gap-8 lg:p-5">
                    <div className="flex min-w-0 flex-col gap-4">
                      <Link href={`/s/${g.seller.handle}`} className="flex min-h-11 items-center gap-2.5 no-underline">
                        <StoreInitials name={g.seller.displayName} />
                        <span className="t-h3 grow">{g.seller.displayName}</span>
                        <ChevronRight aria-hidden className="ic" strokeWidth={ICON_STROKE} />
                      </Link>
                      <ul className="flex flex-col gap-4">
                        {g.items.map((i) => (
                          <BagLine
                            key={i.id}
                            item={{
                              id: i.id,
                              slug: i.slug,
                              title: i.title,
                              meta: [i.tagSize, CONDITION_INFO[i.condition]?.label].filter(Boolean).join(" · "),
                              pricePaise: i.pricePaise,
                              status: i.status,
                              buyable: i.buyable,
                              category: i.category,
                              coverUrl: i.coverUrl,
                            }}
                          />
                        ))}
                      </ul>
                    </div>
                    {buyable.length > 0 ? (
                      <div className="flex flex-col gap-3.5 border-t border-line pt-4 lg:self-start lg:rounded-lg lg:border-t-0 lg:bg-surface-2 lg:p-4">
                        <dl className="flex flex-col gap-2">
                          <div className="t-body flex justify-between">
                            <dt>{buyable.length === 1 ? "Item" : `Items (${buyable.length})`}</dt>
                            <dd>{formatINR(g.subtotalPaise)}</dd>
                          </div>
                          <div className="t-body flex justify-between">
                            <dt>Shipping</dt>
                            <dd>{g.shippingPaise ? formatINR(g.shippingPaise) : "Free"}</dd>
                          </div>
                          <div className="flex justify-between border-t border-dashed border-line pt-2">
                            <dt className="t-h3">Total</dt>
                            <dd className="t-h3">{formatINR(g.subtotalPaise + g.shippingPaise)}</dd>
                          </div>
                        </dl>
                        <p className="t-small muted">
                          {g.seller.freeShippingAbovePaise !== null ? `Free shipping above ${formatINR(g.seller.freeShippingAbovePaise)} from this store. ` : ""}
                          No fees.
                        </p>
                        {g.freeShippingGapPaise !== null && (
                          <p className="t-small font-semibold text-info">
                            Add {formatINR(g.freeShippingGapPaise)} more from {g.seller.displayName} for free shipping.{" "}
                            <Link href={`/s/${g.seller.handle}`} className="underline">
                              See their store
                            </Link>
                          </p>
                        )}
                        <BagCheckoutButton listingIds={buyable.map((i) => i.id)} storeName={g.seller.displayName} />
                        <span className="help text-center">
                          {excluded > 0 ? "The unavailable pieces aren't included. " : ""}
                          {groups.length > 1 ? "You pay one store at a time." : ""}
                        </span>
                      </div>
                    ) : (
                      <p className="t-small muted border-t border-line pt-4 lg:self-start lg:border-t-0">None of these can be checked out right now.</p>
                    )}
                  </section>
                );
              })}
            </div>
          )}
          <ProtectionNote />
        </>
      )}
    </div>
  );
}
