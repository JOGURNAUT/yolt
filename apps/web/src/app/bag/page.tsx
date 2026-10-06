import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getBag } from "@yolt/core";
import { BagCheckoutButton, BagRemoveButton } from "@/components/bag-actions";
import { GuestBag } from "@/components/guest-lists";
import { formatINR } from "@/lib/format";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Bag", robots: { index: false } };

export default async function BagPage() {
  await connection();
  const user = await getCurrentUser();
  const groups = user ? await getBag(db, user.userId) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-xl font-bold">Bag</h1>
        <p className="text-sm text-muted">Items in your bag aren&apos;t reserved. Unique pieces can sell, so check out the ones you really want.</p>
      </header>

      {!groups ? (
        <GuestBag />
      ) : groups.length === 0 ? (
        <p className="py-6 text-sm text-muted">
          Your bag is empty. <Link href="/search" className="underline">Find something</Link>.
        </p>
      ) : (
        groups.map((g) => {
          const buyable = g.items.filter((i) => i.buyable);
          return (
            <section key={g.seller.id} className="space-y-3 rounded-lg border border-line bg-surface p-4">
              <h2 className="font-semibold">
                <Link href={`/s/${g.seller.handle}`} className="hover:underline">{g.seller.displayName}</Link>
              </h2>
              <ul className="divide-y divide-line text-sm">
                {g.items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/p/${i.slug}`} className={`hover:underline ${i.buyable ? "" : "text-muted"}`}>
                      {i.title}
                      {i.tagSize && <span className="text-muted"> · {i.tagSize}</span>}
                    </Link>
                    <span className="flex shrink-0 items-center gap-3">
                      {i.buyable ? (
                        formatINR(i.pricePaise)
                      ) : (
                        <span className="text-muted">{i.status === "RESERVED" || i.status === "PAYMENT_PENDING" ? "Reserved by someone" : "Sold out"}</span>
                      )}
                      <BagRemoveButton listingId={i.id} />
                    </span>
                  </li>
                ))}
              </ul>
              {buyable.length > 0 && (
                <>
                  <div className="space-y-1 border-t border-line pt-3 text-sm">
                    <p className="flex justify-between"><span>Subtotal</span><span>{formatINR(g.subtotalPaise)}</span></p>
                    <p className="flex justify-between text-muted"><span>Shipping</span><span>{g.shippingPaise ? formatINR(g.shippingPaise) : "Free"}</span></p>
                    {g.freeShippingGapPaise !== null && (
                      <p className="text-info">
                        Add {formatINR(g.freeShippingGapPaise)} more from {g.seller.displayName} for free shipping.{" "}
                        <Link href={`/s/${g.seller.handle}`} className="underline">See their store</Link>
                      </p>
                    )}
                  </div>
                  <BagCheckoutButton listingIds={buyable.map((i) => i.id)} storeName={g.seller.displayName} totalPaise={g.subtotalPaise + g.shippingPaise} />
                </>
              )}
            </section>
          );
        })
      )}
      {groups && groups.length > 1 && <p className="text-xs text-muted">Each store ships separately, so each checks out separately.</p>}
    </div>
  );
}
