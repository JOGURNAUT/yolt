import "server-only";
import { and, asc, avg, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { connection } from "next/server";
import { asComplete, drops, listingPhotos, listings, orderItems, reviews, sellers, users } from "@yolt/db";
import { db } from "./db";

/** The three pills on store, search and category grids. */
export type StockFilter = "in-stock" | "sold-out" | "coming-soon";

export const STOCK_FILTERS: { value: StockFilter; label: string }[] = [
  { value: "in-stock", label: "In stock" },
  { value: "sold-out", label: "Sold out" },
  { value: "coming-soon", label: "Coming soon" },
];

const statusesFor = {
  // Reserved items stay in "In stock" with a badge: they may come back.
  "in-stock": ["AVAILABLE", "RESERVED", "PAYMENT_PENDING"],
  "sold-out": ["SOLD", "SOLD_ELSEWHERE"],
  "coming-soon": ["SCHEDULED"],
} as const;

export function parseStockFilter(value: string | string[] | undefined): StockFilter {
  return STOCK_FILTERS.some((f) => f.value === value) ? (value as StockFilter) : "in-stock";
}

const cardColumns = {
  id: listings.id,
  slug: listings.slug,
  title: listings.title,
  tagSize: listings.tagSize,
  condition: listings.condition,
  pricePaise: listings.pricePaise,
  status: listings.status,
  category: listings.category,
  sellerName: sellers.displayName,
  sellerHandle: sellers.handle,
  dropStartsAt: drops.startsAt,
  soldAt: listings.soldAt,
  // Correlated subquery with explicit table names: Drizzle leaves columns unqualified when a
  // query has no join, which would silently compare the photo's own id instead of the listing's.
  coverUrl: sql<string | null>`(
    SELECT lp.url FROM ${listingPhotos} lp WHERE lp.listing_id = ${listings}.id ORDER BY lp.position LIMIT 1)`,
  // The second photo, for the card's hover crossfade.
  backUrl: sql<string | null>`(
    SELECT lp.url FROM ${listingPhotos} lp WHERE lp.listing_id = ${listings}.id ORDER BY lp.position OFFSET 1 LIMIT 1)`,
};

/** Cards are only built from non-draft listings, which the database guarantees are complete. */
function toCard<T extends { id: string; title: string | null; category: string | null; condition: string | null; pricePaise: number | null }>(r: T) {
  if (r.title === null || r.category === null || r.condition === null || r.pricePaise === null) {
    throw new Error(`listing ${r.id} is incomplete but was shown to buyers`);
  }
  return { ...r, title: r.title, category: r.category, condition: r.condition, pricePaise: r.pricePaise };
}

export type ListingCard = ReturnType<typeof toCard<Awaited<ReturnType<typeof selectCards>>[number]>>;

function selectCards() {
  return db
    .select(cardColumns)
    .from(listings)
    .innerJoin(sellers, eq(sellers.id, listings.sellerId))
    .leftJoin(drops, eq(drops.id, listings.dropId));
}

export async function getStore(handle: string) {
  await connection(); // stock changes constantly — always render at request time
  const [store] = await db
    .select()
    .from(sellers)
    .where(and(eq(sellers.handle, handle), eq(sellers.status, "APPROVED")));
  return store ?? null;
}

export async function getStoreCounts(sellerId: string) {
  const rows = await db
    .select({ status: listings.status, n: count() })
    .from(listings)
    .where(eq(listings.sellerId, sellerId))
    .groupBy(listings.status);
  const byStatus = new Map(rows.map((r) => [r.status, r.n]));
  const sum = (f: StockFilter) => statusesFor[f].reduce((t, s) => t + (byStatus.get(s) ?? 0), 0);
  return { "in-stock": sum("in-stock"), "sold-out": sum("sold-out"), "coming-soon": sum("coming-soon") };
}

export async function getStoreListings(sellerId: string, filter: StockFilter, limit = 24) {
  const order =
    filter === "sold-out"
      ? [desc(listings.soldAt)]
      : filter === "coming-soon"
        ? [asc(drops.startsAt), asc(listings.createdAt)]
        : [desc(listings.publishedAt)];
  const rows = await selectCards()
    .where(and(eq(listings.sellerId, sellerId), inArray(listings.status, [...statusesFor[filter]])))
    .orderBy(...order)
    .limit(limit);
  return rows.map(toCard);
}

/** The store's next drop, or the one open right now, with how many pieces it holds. */
export async function getUpcomingDrop(sellerId: string) {
  const [row] = await db
    .select({ drop: drops, pieces: sql<number>`(SELECT count(*)::int FROM ${listings} l WHERE l.drop_id = ${drops}.id)` })
    .from(drops)
    .where(and(eq(drops.sellerId, sellerId), inArray(drops.status, ["SCHEDULED", "LIVE"])))
    .orderBy(asc(drops.startsAt))
    .limit(1);
  return row ? { ...row.drop, pieces: row.pieces } : null;
}

/** Overall and "matched the listing" averages and the count per star, over every review the store has. */
export async function getStoreRating(sellerId: string) {
  const [[totals], byStars] = await Promise.all([
    db
      .select({ total: count(), average: avg(reviews.rating), accuracy: avg(reviews.accuracyRating) })
      .from(reviews)
      .where(eq(reviews.sellerId, sellerId)),
    db.select({ stars: reviews.rating, n: count() }).from(reviews).where(eq(reviews.sellerId, sellerId)).groupBy(reviews.rating),
  ]);
  const total = totals?.total ?? 0;
  const byStar = new Map(byStars.map((r) => [r.stars, r.n]));
  return {
    total,
    average: total && totals?.average ? Number(totals.average) : null,
    accuracy: totals?.accuracy ? Number(totals.accuracy) : null,
    breakdown: [5, 4, 3, 2, 1].map((stars) => ({ stars, n: byStar.get(stars) ?? 0 })),
  };
}

export async function getStoreReviews(sellerId: string) {
  const [rating, rows] = await Promise.all([
    getStoreRating(sellerId),
    db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        body: reviews.body,
        photoUrls: reviews.photoUrls,
        sellerReply: reviews.sellerReply,
        createdAt: reviews.createdAt,
        buyerName: users.name,
        item: orderItems.snapshot,
        itemPricePaise: orderItems.pricePaise,
        itemSlug: listings.slug,
      })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.buyerId))
      .innerJoin(orderItems, eq(orderItems.id, reviews.orderItemId))
      .leftJoin(listings, eq(listings.id, orderItems.listingId))
      .where(eq(reviews.sellerId, sellerId))
      .orderBy(desc(reviews.createdAt))
      .limit(50),
  ]);
  return { ...rating, reviews: rows };
}

export async function getListing(slug: string) {
  await connection();
  const [row] = await db
    .select({ listing: listings, seller: sellers, drop: drops })
    .from(listings)
    .innerJoin(sellers, eq(sellers.id, listings.sellerId))
    .leftJoin(drops, eq(drops.id, listings.dropId))
    .where(eq(listings.slug, slug));
  if (!row || row.listing.status === "DRAFT" || row.seller.status !== "APPROVED") return null;
  const photos = await db
    .select()
    .from(listingPhotos)
    .where(eq(listingPhotos.listingId, row.listing.id))
    .orderBy(asc(listingPhotos.position));
  return { ...row, listing: asComplete(row.listing), photos };
}

export async function getMoreFromStore(sellerId: string, excludeId: string) {
  const rows = await getStoreListings(sellerId, "in-stock", 8);
  return rows.filter((r) => r.id !== excludeId).slice(0, 5);
}

/** Available pieces in the same category from other stores. */
export async function getSimilarListings(category: string, sellerId: string) {
  const rows = await selectCards()
    .where(and(eq(listings.status, "AVAILABLE"), eq(listings.category, category), ne(listings.sellerId, sellerId), eq(sellers.status, "APPROVED")))
    .orderBy(desc(listings.publishedAt))
    .limit(5);
  return rows.map(toCard);
}

export async function getFreshFinds() {
  await connection();
  const rows = await selectCards()
    .where(and(eq(listings.status, "AVAILABLE"), eq(sellers.status, "APPROVED")))
    .orderBy(desc(listings.publishedAt))
    .limit(24);
  return rows.map(toCard);
}

export async function getStores() {
  return db
    .select({ handle: sellers.handle, displayName: sellers.displayName, bio: sellers.bio })
    .from(sellers)
    .where(eq(sellers.status, "APPROVED"))
    .limit(12);
}

export async function getDemoUsers() {
  await connection();
  return db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.phone));
}
