import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { followerCount, isFollowing } from "@yolt/core";
import { FollowButton } from "@/components/follow-button";
import { ProductGrid } from "@/components/product-card";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/session";
import { Stars } from "@/components/stars";
import { StockPills } from "@/components/stock-pills";
import { formatIST, formatINR } from "@/lib/format";
import {
  getStore,
  getStoreCounts,
  getStoreListings,
  getStoreReviews,
  getUpcomingDrop,
  parseStockFilter,
  type StockFilter,
} from "@/lib/server/queries";

export async function generateMetadata({ params }: PageProps<"/s/[handle]">): Promise<Metadata> {
  const store = await getStore((await params).handle);
  return store ? { title: store.displayName, description: store.bio ?? undefined } : {};
}

const EMPTY: Record<StockFilter, string> = {
  "in-stock": "Nothing in stock right now. Check Coming soon, or follow the store for new drops.",
  "sold-out": "Nothing sold yet.",
  "coming-soon": "No upcoming drops announced.",
};

export default async function StorePage({ params, searchParams }: PageProps<"/s/[handle]">) {
  const { handle } = await params;
  const filter = parseStockFilter((await searchParams).status);
  const store = await getStore(handle);
  if (!store) notFound();

  const [counts, items, drop, reviewData] = await Promise.all([
    getStoreCounts(store.id),
    getStoreListings(store.id, filter),
    getUpcomingDrop(store.id),
    getStoreReviews(store.id),
  ]);
  const user = await getCurrentUser();
  const [followers, following] = await Promise.all([
    followerCount(db, store.id),
    user ? isFollowing(db, { userId: user.userId, sellerId: store.id }) : Promise.resolve(false),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <div
          aria-hidden="true"
          className="flex size-16 shrink-0 items-center justify-center rounded-full bg-placeholder text-xl font-bold"
        >
          {store.displayName.slice(0, 1)}
        </div>
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-bold">{store.displayName}</h1>
          {store.instagramHandle && <p className="text-sm text-muted">@{store.instagramHandle}</p>}
          {user?.userId !== store.userId && <FollowButton sellerId={store.id} following={following} followers={followers} signedIn={user !== null} />}
          {store.bio && <p className="text-sm">{store.bio}</p>}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {reviewData.average !== null && (
              <a href="#reviews" className="hover:underline">
                <Stars rating={reviewData.average} /> {reviewData.average.toFixed(1)} (
                {reviewData.total} reviews)
              </a>
            )}
            {store.kycStatus === "VERIFIED" && (
              <span className="rounded-full bg-surface px-2 py-0.5 text-xs" title="PAN and bank account checked. Items are not authenticated by YOLT.">
                Identity verified
              </span>
            )}
          </p>
          <p className="text-xs text-muted">
            Ships in {store.dispatchDays} days · Shipping {formatINR(store.shippingFeePaise)}
            {store.freeShippingAbovePaise !== null && `, free above ${formatINR(store.freeShippingAbovePaise)}`}
          </p>
        </div>
      </header>

      {drop && (
        <a
          href={`/d/${drop.id}`}
          className="block rounded-lg border border-line bg-surface p-4 hover:border-foreground"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Upcoming drop</p>
          <p className="font-semibold">{drop.title}</p>
          <p className="text-sm text-muted">{formatIST(drop.startsAt)}</p>
        </a>
      )}

      <section aria-label="Items" className="space-y-4">
        <StockPills basePath={`/s/${handle}`} active={filter} counts={counts} />
        {items.length ? <ProductGrid items={items} /> : <p className="py-8 text-center text-muted">{EMPTY[filter]}</p>}
      </section>

      <section aria-label="Seller details" className="rounded-lg border border-line bg-surface p-4 text-xs text-muted">
        <p className="font-medium text-foreground">Seller details</p>
        <p>
          Sold by {store.displayName}
          {store.pickupState && <>, shipping from {store.pickupState}</>}. Customer care:{" "}
          <Link href="/legal/grievance" className="underline">YOLT support</Link>.
        </p>
      </section>

      <section id="reviews" className="space-y-4 border-t border-line pt-6">
        <h2 className="text-lg font-semibold">Reviews</h2>
        {reviewData.total === 0 ? (
          <p className="text-sm text-muted">No reviews yet. Reviews come only from verified purchases.</p>
        ) : (
          <>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-3xl font-bold">{reviewData.average!.toFixed(1)}</p>
                <Stars rating={reviewData.average!} />
                <p className="text-xs text-muted">{reviewData.total} verified purchases</p>
              </div>
              <ul className="flex-1 space-y-1 text-xs">
                {reviewData.breakdown.map((b) => (
                  <li key={b.stars} className="flex items-center gap-2">
                    <span className="w-3">{b.stars}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-placeholder">
                      <span
                        className="block h-full bg-foreground"
                        style={{ width: `${(b.n / reviewData.total) * 100}%` }}
                      />
                    </span>
                    <span className="w-4 text-right text-muted">{b.n}</span>
                  </li>
                ))}
              </ul>
            </div>
            <ul className="space-y-4">
              {reviewData.reviews.map((r) => (
                <li key={r.id} className="rounded-lg border border-line bg-surface p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{r.buyerName?.split(" ")[0] ?? "Buyer"}</span>
                    <Stars rating={r.rating} />
                  </div>
                  {r.body && <p className="mt-2 text-sm">{r.body}</p>}
                  {r.photoUrls.length > 0 && (
                    <div className="mt-2 flex gap-2">
                      {r.photoUrls.map((u) => (
                        // eslint-disable-next-line @next/next/no-img-element -- buyer's review photo
                        <img key={u} src={u} alt={`Photo from ${r.buyerName?.split(" ")[0] ?? "the buyer"}`} className="size-20 rounded object-cover" />
                      ))}
                    </div>
                  )}
                  <p className="mt-3 text-xs text-muted">
                    Bought: {r.item.title}
                    {r.item.tagSize && ` · ${r.item.tagSize}`} · {formatINR(r.itemPricePaise)}
                  </p>
                  {r.sellerReply && (
                    <p className="mt-3 border-l-2 border-line pl-3 text-sm">
                      <span className="font-medium">{store.displayName}:</span> {r.sellerReply}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
