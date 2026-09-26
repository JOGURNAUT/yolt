import "server-only";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
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
  // Correlated subquery with explicit table names: Drizzle leaves columns unqualified when a
  // query has no join, which would silently compare the photo's own id instead of the listing's.
  coverUrl: sql<string | null>`(
    SELECT lp.url FROM ${listingPhotos} lp WHERE lp.listing_id = ${listings}.id ORDER BY lp.position LIMIT 1)`,
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

export async function getStoreListings(sellerId: string, filter: StockFilter) {
  const order =
    filter === "sold-out"
      ? [desc(listings.soldAt)]
      : filter === "coming-soon"
        ? [asc(drops.startsAt), asc(listings.createdAt)]
        : [desc(listings.publishedAt)];
  const rows = await selectCards()
    .where(and(eq(listings.sellerId, sellerId), inArray(listings.status, [...statusesFor[filter]])))
    .orderBy(...order)
    .limit(60);
  return rows.map(toCard);
}

export async function getUpcomingDrop(sellerId: string) {
  const [drop] = await db
    .select()
    .from(drops)
    .where(and(eq(drops.sellerId, sellerId), eq(drops.status, "SCHEDULED")))
    .orderBy(asc(drops.startsAt))
    .limit(1);
  return drop ?? null;
}

export async function getStoreReviews(sellerId: string) {
  const rows = await db
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
    })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.buyerId))
    .innerJoin(orderItems, eq(orderItems.id, reviews.orderItemId))
    .where(eq(reviews.sellerId, sellerId))
    .orderBy(desc(reviews.createdAt))
    .limit(50);
  const total = rows.length;
  const average = total ? rows.reduce((t, r) => t + r.rating, 0) / total : null;
  const breakdown = [5, 4, 3, 2, 1].map((stars) => ({ stars, n: rows.filter((r) => r.rating === stars).length }));
  return { reviews: rows, total, average, breakdown };
}

export async function getListing(slug: string) {
  await connection();
  const [row] = await db
    .select({ listing: listings, seller: sellers, drop: drops })
    .from(listings)
    .innerJoin(sellers, eq(sellers.id, listings.sellerId))
    .leftJoin(drops, eq(drops.id, listings.dropId))
    .where(eq(listings.slug, slug));
  if (!row || row.listing.status === "DRAFT") return null;
  const photos = await db
    .select()
    .from(listingPhotos)
    .where(eq(listingPhotos.listingId, row.listing.id))
    .orderBy(asc(listingPhotos.position));
  return { ...row, listing: asComplete(row.listing), photos };
}

export async function getMoreFromStore(sellerId: string, excludeId: string) {
  const rows = await getStoreListings(sellerId, "in-stock");
  return rows.filter((r) => r.id !== excludeId).slice(0, 4);
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
