import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { listings, savedItems, sellers, type Db } from "@yolt/db";
import { currentSlot, LIVE_LISTING_STATUSES } from "./curation";
import { listingCardsByIds, type SearchHit } from "./search";

/**
 * Landing page data (docs/design-plan.md, batch 2). Everything is built from real data: nothing
 * is auto-filled to look busier than it is. All reads hide drafts and stores that aren't approved.
 */

/** A piece needs at least this many saves in the window to count as trending. */
export const TRENDING_MIN_SAVES = 3;
/** Fewer qualifying pieces than this and the section falls back to the newest pieces. */
export const TRENDING_MIN_ITEMS = 4;
export const TRENDING_WINDOW_DAYS = 7;
export const JUST_SOLD_WINDOW_DAYS = 30;
export const HOME_SECTION_LIMIT = 12;

const DAY = 86_400_000;
/** Same statuses as the "In stock" pill: reserved pieces may come back. */
const IN_STOCK = [...LIVE_LISTING_STATUSES];

export type FeaturedStore = {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  inStockCount: number;
  /** CURATED: picked by staff. MOST_STOCKED: the fallback, the approved store with the most pieces. */
  source: "CURATED" | "MOST_STOCKED";
};

export type HomeData = {
  trending: { mode: "TRENDING" | "JUST_DROPPED"; items: SearchHit[] };
  justSold: SearchHit[];
  grails: SearchHit[];
  featuredStore: FeaturedStore | null;
  edit: { title: string; items: SearchHit[] } | null;
};

async function trending(db: Db, now: Date): Promise<HomeData["trending"]> {
  const since = new Date(now.getTime() - TRENDING_WINDOW_DAYS * DAY);
  const rows = await db
    .select({ id: savedItems.listingId, saves: sql<number>`count(*)::int` })
    .from(savedItems)
    .innerJoin(listings, eq(listings.id, savedItems.listingId))
    .innerJoin(sellers, eq(sellers.id, listings.sellerId))
    .where(and(gte(savedItems.createdAt, since), inArray(listings.status, IN_STOCK), eq(sellers.status, "APPROVED")))
    .groupBy(savedItems.listingId, listings.publishedAt)
    .having(sql`count(*) >= ${TRENDING_MIN_SAVES}`)
    .orderBy(desc(sql`count(*)`), desc(listings.publishedAt), savedItems.listingId)
    .limit(HOME_SECTION_LIMIT);
  if (rows.length >= TRENDING_MIN_ITEMS) {
    return { mode: "TRENDING", items: await listingCardsByIds(db, rows.map((r) => r.id), { approvedOnly: true }) };
  }
  const newest = await db
    .select({ id: listings.id })
    .from(listings)
    .innerJoin(sellers, eq(sellers.id, listings.sellerId))
    .where(and(inArray(listings.status, IN_STOCK), eq(sellers.status, "APPROVED")))
    .orderBy(sql`${listings.publishedAt} DESC NULLS LAST`, desc(listings.createdAt))
    .limit(HOME_SECTION_LIMIT);
  return { mode: "JUST_DROPPED", items: await listingCardsByIds(db, newest.map((r) => r.id), { approvedOnly: true }) };
}

async function justSold(db: Db, now: Date): Promise<SearchHit[]> {
  const since = new Date(now.getTime() - JUST_SOLD_WINDOW_DAYS * DAY);
  const rows = await db
    .select({ id: listings.id })
    .from(listings)
    .innerJoin(sellers, eq(sellers.id, listings.sellerId))
    .where(and(eq(listings.status, "SOLD"), gte(listings.soldAt, since), eq(sellers.status, "APPROVED")))
    .orderBy(desc(listings.soldAt))
    .limit(HOME_SECTION_LIMIT);
  return listingCardsByIds(db, rows.map((r) => r.id), { approvedOnly: true });
}

/** A curated list's pieces, in curated order, minus any that sold, were withdrawn or whose store was suspended. */
async function liveCards(db: Db, ids: string[]): Promise<SearchHit[]> {
  const cards = await listingCardsByIds(db, ids, { approvedOnly: true });
  return cards.filter((c) => (LIVE_LISTING_STATUSES as readonly string[]).includes(c.status));
}

async function storeView(db: Db, sellerId: string, source: FeaturedStore["source"]): Promise<FeaturedStore | null> {
  const [row] = await db
    .select({
      id: sellers.id,
      handle: sellers.handle,
      displayName: sellers.displayName,
      bio: sellers.bio,
      logoUrl: sellers.logoUrl,
      bannerUrl: sellers.bannerUrl,
      inStockCount: sql<number>`(SELECT count(*)::int FROM ${listings} l WHERE l.seller_id = ${sellers}.id AND l.status IN ('AVAILABLE', 'RESERVED', 'PAYMENT_PENDING'))`,
    })
    .from(sellers)
    .where(and(eq(sellers.id, sellerId), eq(sellers.status, "APPROVED")));
  return row ? { ...row, source } : null;
}

async function featuredStore(db: Db, now: Date): Promise<FeaturedStore | null> {
  const slot = await currentSlot(db, "FEATURED_STORE", now);
  if (slot?.sellerId) {
    // A suspended curated store falls through to the default instead of showing an empty hole.
    const curated = await storeView(db, slot.sellerId, "CURATED");
    if (curated) return curated;
  }
  const [top] = await db
    .select({ id: sellers.id })
    .from(sellers)
    .innerJoin(listings, eq(listings.sellerId, sellers.id))
    .where(and(eq(sellers.status, "APPROVED"), inArray(listings.status, IN_STOCK)))
    .groupBy(sellers.id, sellers.handle)
    .orderBy(desc(sql`count(*)`), sellers.handle)
    .limit(1);
  return top ? storeView(db, top.id, "MOST_STOCKED") : null;
}

export async function getHomeData(db: Db, now = new Date()): Promise<HomeData> {
  const [trend, sold, grailsSlot, store, editSlot] = await Promise.all([
    trending(db, now),
    justSold(db, now),
    currentSlot(db, "GRAILS", now),
    featuredStore(db, now),
    currentSlot(db, "EDIT", now),
  ]);
  const editItems = editSlot ? await liveCards(db, editSlot.listingIds) : [];
  return {
    trending: trend,
    justSold: sold,
    // Never auto-filled: with nothing curated this is an empty list and the section hides.
    grails: grailsSlot ? await liveCards(db, grailsSlot.listingIds) : [],
    featuredStore: store,
    edit: editSlot && editItems.length ? { title: editSlot.title ?? "", items: editItems } : null,
  };
}
