import "server-only";
import { and, asc, avg, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { connection } from "next/server";
import { CHECKOUT_HOLD_SECONDS, getHomeData, getInYourSizes, getPreferences, hasDropReminder, searchListings } from "@yolt/core";
import type { SearchParams } from "@yolt/shared";
import { addresses, asComplete, drops, follows, holds, listingPhotos, listings, orderItems, orders, reviews, savedItems, sellers, users } from "@yolt/db";
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
  // The back photo, for the card's hover. Only a photo marked BACK counts: a detail or a flaw close-up is not a back.
  backUrl: sql<string | null>`(
    SELECT lp.url FROM ${listingPhotos} lp WHERE lp.listing_id = ${listings}.id AND lp.kind = 'BACK' ORDER BY lp.position LIMIT 1)`,
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

// ---------------------------------------------------------------------------
// Landing and signed-in home
// ---------------------------------------------------------------------------

const IN_STOCK = ["AVAILABLE", "RESERVED", "PAYMENT_PENDING"] as const;

/** Trending, Grails, edit, featured store and just-sold, in one call (the same as GET /api/home). */
export async function getHome() {
  await connection();
  return getHomeData(db);
}

export type HomeData = Awaited<ReturnType<typeof getHome>>;

export type DropTicketData = {
  id: string;
  title: string;
  startsAt: Date;
  /** LIVE, or SCHEDULED with the start time already passed (the opening is moments away). */
  live: boolean;
  sellerName: string;
  sellerHandle: string;
  /** The drop's poster, when its seller set one. */
  coverUrl: string | null;
  pieces: number;
  available: number;
  maxHoldsPerBuyer: number;
  thumbs: { coverUrl: string | null; title: string; category: string; pricePaise: number | null }[];
};

/** The next live or upcoming drops, soonest first, with a few piece photos each. */
export async function getDropsStrip(limit = 3): Promise<{ drops: DropTicketData[]; serverNow: Date }> {
  await connection();
  const serverNow = new Date();
  const rows = await db
    .select({
      id: drops.id,
      title: drops.title,
      startsAt: drops.startsAt,
      status: drops.status,
      maxHoldsPerBuyer: drops.maxHoldsPerBuyer,
      coverUrl: drops.coverUrl,
      sellerName: sellers.displayName,
      sellerHandle: sellers.handle,
      pieces: sql<number>`(SELECT count(*)::int FROM ${listings} l WHERE l.drop_id = ${drops}.id)`,
      available: sql<number>`(SELECT count(*)::int FROM ${listings} l WHERE l.drop_id = ${drops}.id AND l.status = 'AVAILABLE')`,
    })
    .from(drops)
    .innerJoin(sellers, eq(sellers.id, drops.sellerId))
    .where(and(inArray(drops.status, ["SCHEDULED", "LIVE"]), eq(sellers.status, "APPROVED")))
    .orderBy(asc(drops.startsAt))
    .limit(limit);
  if (rows.length === 0) return { drops: [], serverNow };

  const pieces = await db
    .select({ dropId: listings.dropId, title: listings.title, category: listings.category, pricePaise: listings.pricePaise, coverUrl: cardColumns.coverUrl })
    .from(listings)
    .where(inArray(listings.dropId, rows.map((r) => r.id)))
    .orderBy(asc(listings.createdAt));
  return {
    serverNow,
    drops: rows.map(({ status, ...d }) => ({
      ...d,
      live: status === "LIVE" || d.startsAt <= serverNow,
      thumbs: pieces
        .filter((p) => p.dropId === d.id)
        .slice(0, 3)
        .map((p) => ({ coverUrl: p.coverUrl, title: p.title ?? "Piece in this drop", category: p.category ?? "", pricePaise: p.pricePaise })),
    })),
  };
}

/** Rating, review count and city for a store, for the spotlight slide. */
export async function getStoreFacts(sellerId: string) {
  const [row] = await db
    .select({
      city: sellers.pickupCity,
      instagramVerified: sql<boolean>`${sellers.instagramVerifiedAt} IS NOT NULL`,
      rating: sql<number | null>`(SELECT avg(r.rating)::float FROM ${reviews} r WHERE r.seller_id = ${sellers}.id)`,
      reviewCount: sql<number>`(SELECT count(*)::int FROM ${reviews} r WHERE r.seller_id = ${sellers}.id)`,
    })
    .from(sellers)
    .where(eq(sellers.id, sellerId));
  return row ?? null;
}

export type StoreCardData = {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  city: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  instagramVerified: boolean;
  rating: number | null;
  reviewCount: number;
  thumbs: { coverUrl: string | null; category: string }[];
};

/** Approved stores with pieces in stock, the most stocked first, with their three newest pieces. */
export async function getStoresToDiscover(limit = 6, exclude: string[] = []): Promise<StoreCardData[]> {
  await connection();
  const inStock = sql<number>`(SELECT count(*)::int FROM ${listings} l WHERE l.seller_id = ${sellers}.id AND l.status IN ('AVAILABLE', 'RESERVED', 'PAYMENT_PENDING'))`;
  const withStock = await db
    .select({
      id: sellers.id,
      handle: sellers.handle,
      displayName: sellers.displayName,
      bio: sellers.bio,
      city: sellers.pickupCity,
      logoUrl: sellers.logoUrl,
      bannerUrl: sellers.bannerUrl,
      instagramVerified: sql<boolean>`${sellers.instagramVerifiedAt} IS NOT NULL`,
      rating: sql<number | null>`(SELECT avg(r.rating)::float FROM ${reviews} r WHERE r.seller_id = ${sellers}.id)`,
      reviewCount: sql<number>`(SELECT count(*)::int FROM ${reviews} r WHERE r.seller_id = ${sellers}.id)`,
    })
    .from(sellers)
    .where(
      and(
        eq(sellers.status, "APPROVED"),
        sql`${inStock} > 0`,
        exclude.length ? sql`${sellers.id} NOT IN (${sql.join(exclude.map((id) => sql`${id}::uuid`), sql`, `)})` : undefined,
      ),
    )
    .orderBy(desc(inStock), asc(sellers.handle))
    .limit(limit);
  if (withStock.length === 0) return [];

  const ids = sql.join(withStock.map((s) => sql`${s.id}::uuid`), sql`, `);
  const thumbs = await db.execute<{ seller_id: string; cover: string | null; category: string }>(sql`
    SELECT seller_id, cover, category FROM (
      SELECT l.seller_id, l.category,
        (SELECT lp.url FROM listing_photos lp WHERE lp.listing_id = l.id ORDER BY lp.position LIMIT 1) AS cover,
        row_number() OVER (PARTITION BY l.seller_id ORDER BY l.published_at DESC NULLS LAST, l.created_at DESC) AS rn
      FROM listings l
      WHERE l.seller_id IN (${ids}) AND l.status IN ('AVAILABLE', 'RESERVED', 'PAYMENT_PENDING')
    ) t WHERE rn <= 3 ORDER BY seller_id, rn`);
  return withStock.map((s) => ({
    ...s,
    thumbs: [...thumbs].filter((t) => t.seller_id === s.id).map((t) => ({ coverUrl: t.cover, category: t.category })),
  }));
}

export async function getFollowedSellerIds(userId: string) {
  const rows = await db.select({ id: follows.sellerId }).from(follows).where(eq(follows.userId, userId));
  return rows.map((r) => r.id);
}

/** The newest in-stock pieces from stores the buyer follows. */
export async function getNewFromFollowed(sellerIds: string[], limit = 12) {
  if (sellerIds.length === 0) return [];
  await connection();
  const rows = await selectCards()
    .where(and(inArray(listings.sellerId, sellerIds), inArray(listings.status, [...IN_STOCK]), eq(sellers.status, "APPROVED")))
    .orderBy(sql`${listings.publishedAt} DESC NULLS LAST`, desc(listings.createdAt))
    .limit(limit);
  return rows.map(toCard);
}

/** Saved sizes, styles and budget, and the pieces in those sizes (the logic behind /api/me/in-your-sizes). */
export async function getMyPreferences(userId: string) {
  return getPreferences(db, userId);
}

export async function getMyInYourSizes(userId: string) {
  await connection();
  return getInYourSizes(db, userId);
}

/** Which of these drops the buyer has asked to be reminded about. */
export async function getReminderSet(userId: string | null, dropIds: string[]) {
  if (!userId) return new Set<string>();
  const on = await Promise.all(dropIds.map(async (dropId) => ((await hasDropReminder(db, { userId, dropId })) ? dropId : null)));
  return new Set(on.filter((id): id is string => id !== null));
}

/** How long a claimed piece is held for payment, in minutes (said on live drop slides). */
export const CLAIM_HOLD_MINUTES = CHECKOUT_HOLD_SECONDS / 60;

// ---------------------------------------------------------------------------
// Drops list and drop page
// ---------------------------------------------------------------------------

export type EndedDropData = { id: string; title: string; startsAt: Date; sellerName: string; pieces: number; sold: number };

/** Live, upcoming and recently ended drops (the last 14 days), with the signed-in buyer's reminders. */
export async function getDropsPage(userId: string | null) {
  await connection();
  const [{ drops: open, serverNow }, ended] = await Promise.all([
    getDropsStrip(50),
    db
      .select({
        id: drops.id,
        title: drops.title,
        startsAt: drops.startsAt,
        sellerName: sellers.displayName,
        pieces: sql<number>`(SELECT count(*)::int FROM ${listings} l WHERE l.drop_id = ${drops}.id)`,
        sold: sql<number>`(SELECT count(*)::int FROM ${listings} l WHERE l.drop_id = ${drops}.id AND l.status IN ('SOLD', 'SOLD_ELSEWHERE'))`,
      })
      .from(drops)
      .innerJoin(sellers, eq(sellers.id, drops.sellerId))
      .where(and(eq(drops.status, "ENDED"), eq(sellers.status, "APPROVED"), sql`${drops.startsAt} > now() - interval '14 days'`))
      .orderBy(desc(drops.startsAt))
      .limit(6),
  ]);
  const reminders = await getReminderSet(userId, open.map((d) => d.id));
  return {
    serverNow,
    live: open.filter((d) => d.live),
    upcoming: open.filter((d) => !d.live),
    ended: ended satisfies EndedDropData[],
    reminders,
  };
}

/** A cancelled drop's name and store, so its link says so instead of "not found". Drafts stay hidden. */
export async function getCancelledDrop(dropId: string) {
  const [row] = await db
    .select({ title: drops.title, storeName: sellers.displayName, handle: sellers.handle })
    .from(drops)
    .innerJoin(sellers, eq(sellers.id, drops.sellerId))
    .where(and(eq(drops.id, dropId), eq(drops.status, "CANCELLED"), eq(sellers.status, "APPROVED")));
  return row ?? null;
}

/** The buyer's pieces held right now in this drop, with the order that pays for them. */
export async function getDropHolds(userId: string, dropId: string) {
  return db
    .select({ listingId: holds.listingId, orderId: holds.orderId, expiresAt: holds.expiresAt, pricePaise: listings.pricePaise })
    .from(holds)
    .innerJoin(listings, eq(listings.id, holds.listingId))
    .where(and(eq(holds.buyerId, userId), eq(holds.status, "ACTIVE"), eq(listings.dropId, dropId), sql`${holds.expiresAt} > now()`))
    .orderBy(asc(holds.expiresAt));
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchStoreRow = {
  id: string;
  handle: string;
  displayName: string;
  city: string | null;
  bio: string | null;
  rating: number | null;
  reviewCount: number;
  inStock: number;
};

const storeRowColumns = {
  id: sellers.id,
  handle: sellers.handle,
  displayName: sellers.displayName,
  city: sellers.pickupCity,
  bio: sellers.bio,
  rating: sql<number | null>`(SELECT avg(r.rating)::float FROM ${reviews} r WHERE r.seller_id = ${sellers}.id)`,
  reviewCount: sql<number>`(SELECT count(*)::int FROM ${reviews} r WHERE r.seller_id = ${sellers}.id)`,
  inStock: sql<number>`(SELECT count(*)::int FROM ${listings} l WHERE l.seller_id = ${sellers}.id AND l.status IN ('AVAILABLE', 'RESERVED', 'PAYMENT_PENDING'))`,
};

/** Stores for the Stores tab: the handles the search matched, or every approved store. */
export async function getSearchStoreRows(handles: string[] | null): Promise<SearchStoreRow[]> {
  if (handles && handles.length === 0) return [];
  return db
    .select(storeRowColumns)
    .from(sellers)
    .where(and(eq(sellers.status, "APPROVED"), handles ? inArray(sellers.handle, handles) : undefined))
    .orderBy(desc(storeRowColumns.inStock), asc(sellers.handle))
    .limit(24);
}

/**
 * For zero results: what each filter would give back if it were removed, and a few close matches
 * (pieces that miss just one filter). One search per filter, so it's only called when nothing matched.
 */
export async function getRelaxedSearches(without: SearchParams[]) {
  const results = await Promise.all(without.map((p) => searchListings(db, p)));
  const gains = results.map((r) => r.total);
  const seen = new Set<string>();
  const close = results
    .flatMap((r) => r.hits.slice(0, 3))
    .filter((h) => !seen.has(h.id) && seen.add(h.id))
    .slice(0, 4);
  return { gains, close };
}

// ---------------------------------------------------------------------------
// Saved and account
// ---------------------------------------------------------------------------

export type FollowedStoreRow = SearchStoreRow & { drop: { id: string; title: string; startsAt: Date } | null };

/** Stores the buyer follows, newest follow first, with each one's next drop. */
export async function getFollowedStoreRows(userId: string): Promise<FollowedStoreRow[]> {
  const rows = await db
    .select(storeRowColumns)
    .from(follows)
    .innerJoin(sellers, eq(sellers.id, follows.sellerId))
    .where(and(eq(follows.userId, userId), eq(sellers.status, "APPROVED")))
    .orderBy(desc(follows.createdAt));
  const upcoming = await Promise.all(rows.map((s) => getUpcomingDrop(s.id)));
  return rows.map((s, i) => {
    const d = upcoming[i];
    return { ...s, drop: d ? { id: d.id, title: d.title, startsAt: d.startsAt } : null };
  });
}

/** The counts on the profile rows: orders on the way, saved pieces and stores, saved addresses. */
export async function getAccountCounts(userId: string) {
  const [[orderRow], [savedRow], [followRow], [addressRow]] = await Promise.all([
    db
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.buyerId, userId), inArray(orders.status, ["CONFIRMED", "PACKED", "SHIPPED"]))),
    db.select({ n: count() }).from(savedItems).where(eq(savedItems.userId, userId)),
    db.select({ n: count() }).from(follows).where(eq(follows.userId, userId)),
    db.select({ n: count() }).from(addresses).where(eq(addresses.userId, userId)),
  ]);
  return { onTheWay: orderRow?.n ?? 0, saved: savedRow?.n ?? 0, following: followRow?.n ?? 0, addresses: addressRow?.n ?? 0 };
}
