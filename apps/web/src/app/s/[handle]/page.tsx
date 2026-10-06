import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { followerCount, hasDropReminder, isFollowing } from "@yolt/core";
import { StockPills } from "@/components/stock-pills";
import { ReviewsSection } from "@/components/store/reviews-section";
import { StoreGrid } from "@/components/store/store-grid";
import { StoreHeader } from "@/components/store/store-header";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/session";
import {
  getStore,
  getStoreCounts,
  getStoreListings,
  getStoreReviews,
  getUpcomingDrop,
  parseStockFilter,
} from "@/lib/server/queries";

const PAGE = 24;

export async function generateMetadata({ params }: PageProps<"/s/[handle]">): Promise<Metadata> {
  const store = await getStore((await params).handle);
  return store ? { title: store.displayName, description: store.bio ?? undefined } : {};
}

/** How many cards to show: a multiple of the page size, so "Show more" is a plain link. */
function parseShown(value: string | string[] | undefined) {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > PAGE ? Math.min(Math.ceil(n / PAGE) * PAGE, 120) : PAGE;
}

export default async function StorePage({ params, searchParams }: PageProps<"/s/[handle]">) {
  const { handle } = await params;
  const query = await searchParams;
  const filter = parseStockFilter(query.status);
  const shown = parseShown(query.shown);
  const store = await getStore(handle);
  if (!store) notFound();

  const [user, counts, items, drop, reviewData] = await Promise.all([
    getCurrentUser(),
    getStoreCounts(store.id),
    getStoreListings(store.id, filter, shown),
    getUpcomingDrop(store.id),
    getStoreReviews(store.id),
  ]);
  const [followers, following, reminderOn] = await Promise.all([
    followerCount(db, store.id),
    user ? isFollowing(db, { userId: user.userId, sellerId: store.id }) : false,
    user && drop ? hasDropReminder(db, { userId: user.userId, dropId: drop.id }) : false,
  ]);

  const base = `/s/${handle}${filter === "in-stock" ? "" : `?status=${filter}`}`;
  const moreHref = `${base}${filter === "in-stock" ? "?" : "&"}shown=${shown + PAGE}`;
  const isOwner = user?.userId === store.userId;

  return (
    <div className="page-wide space-y-6">
      <StoreHeader
        store={store}
        rating={reviewData}
        followers={followers}
        following={following}
        signedIn={user !== null}
        isOwner={isOwner}
        drop={drop}
        reminderOn={reminderOn}
      />

      <section aria-label="Pieces" className="space-y-3 pt-2 lg:space-y-4 lg:pt-6">
        <StockPills basePath={`/s/${handle}`} active={filter} counts={counts} />
        <StoreGrid
          filter={filter}
          items={items}
          total={counts[filter]}
          moreHref={moreHref}
          follow={isOwner ? null : { sellerId: store.id, following, signedIn: user !== null }}
        />
      </section>

      <div className="pt-8 lg:pt-12">
        <ReviewsSection rating={reviewData} reviews={reviewData.reviews} storeName={store.displayName} />
      </div>

      <section aria-label="Seller details" className="card t-small muted p-4">
        <p className="font-bold text-foreground">Seller details</p>
        <p>
          Sold by {store.displayName}
          {store.pickupState && <>, shipping from {store.pickupState}</>}. Customer care:{" "}
          <Link href="/legal/grievance" className="underline">
            YOLT support
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
