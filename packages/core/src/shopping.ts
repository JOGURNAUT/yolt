import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { bagItems, follows, listings, savedItems, sellers, type Db } from "@yolt/db";
import { listingCardsByIds, type SearchHit } from "./search";

/**
 * Saved items, followed stores and the bag (docs/user-flows.md B-F3, B-F5).
 * Guests keep saves and bag on their device; `merge*` folds them into the account at login.
 */

export const MAX_SAVED = 500;
export const MAX_BAG = 30;
const MAX_MERGE = 100;

/** A listing a buyer can act on: published (not a draft) and from an approved store. */
async function visibleListingIds(db: Db, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: listings.id })
    .from(listings)
    .innerJoin(sellers, eq(sellers.id, listings.sellerId))
    .where(and(inArray(listings.id, ids), sql`${listings.status} <> 'DRAFT'`, eq(sellers.status, "APPROVED")));
  return rows.map((r) => r.id);
}

const validIds = (ids: string[]) => [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, MAX_MERGE);

// ---------------------------------------------------------------------------
// Saved items
// ---------------------------------------------------------------------------

export async function saveListing(db: Db, input: { userId: string; listingId: string }) {
  const [visible] = await visibleListingIds(db, [input.listingId]);
  if (!visible) return { ok: false as const, reason: "NOT_FOUND" as const };
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(savedItems).where(eq(savedItems.userId, input.userId))) as [{ n: number }];
  if (n >= MAX_SAVED) return { ok: false as const, reason: "TOO_MANY" as const };
  await db.insert(savedItems).values({ userId: input.userId, listingId: visible }).onConflictDoNothing();
  return { ok: true as const };
}

export async function unsaveListing(db: Db, input: { userId: string; listingId: string }) {
  await db.delete(savedItems).where(and(eq(savedItems.userId, input.userId), eq(savedItems.listingId, input.listingId)));
}

export async function savedListingIds(db: Db, userId: string) {
  const rows = await db.select({ id: savedItems.listingId }).from(savedItems).where(eq(savedItems.userId, userId));
  return rows.map((r) => r.id);
}

/** Saved items newest first. Sold items stay, marked sold, so buyers can find similar pieces. */
export async function getSavedListings(db: Db, userId: string): Promise<SearchHit[]> {
  const rows = await db
    .select({ id: savedItems.listingId })
    .from(savedItems)
    .where(eq(savedItems.userId, userId))
    .orderBy(desc(savedItems.createdAt))
    .limit(MAX_SAVED);
  return listingCardsByIds(db, rows.map((r) => r.id));
}

/** Folds a guest's device saves into the account, without duplicates. */
export async function mergeSaves(db: Db, input: { userId: string; listingIds: string[] }) {
  const ids = await visibleListingIds(db, validIds(input.listingIds));
  if (ids.length) await db.insert(savedItems).values(ids.map((listingId) => ({ userId: input.userId, listingId }))).onConflictDoNothing();
  return { merged: ids.length };
}

// ---------------------------------------------------------------------------
// Follows
// ---------------------------------------------------------------------------

export async function followSeller(db: Db, input: { userId: string; sellerId: string }) {
  const [seller] = await db
    .select({ id: sellers.id, userId: sellers.userId })
    .from(sellers)
    .where(and(eq(sellers.id, input.sellerId), eq(sellers.status, "APPROVED")));
  if (!seller) return { ok: false as const, reason: "NOT_FOUND" as const };
  if (seller.userId === input.userId) return { ok: false as const, reason: "OWN_STORE" as const };
  await db.insert(follows).values({ userId: input.userId, sellerId: seller.id }).onConflictDoNothing();
  return { ok: true as const };
}

export async function unfollowSeller(db: Db, input: { userId: string; sellerId: string }) {
  await db.delete(follows).where(and(eq(follows.userId, input.userId), eq(follows.sellerId, input.sellerId)));
}

export async function followerCount(db: Db, sellerId: string) {
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(follows).where(eq(follows.sellerId, sellerId))) as [{ n: number }];
  return n;
}

export async function isFollowing(db: Db, input: { userId: string; sellerId: string }) {
  const [row] = await db
    .select({ sellerId: follows.sellerId })
    .from(follows)
    .where(and(eq(follows.userId, input.userId), eq(follows.sellerId, input.sellerId)));
  return Boolean(row);
}

export async function getFollowedStores(db: Db, userId: string) {
  return db
    .select({ handle: sellers.handle, displayName: sellers.displayName, bio: sellers.bio })
    .from(follows)
    .innerJoin(sellers, eq(sellers.id, follows.sellerId))
    .where(and(eq(follows.userId, userId), eq(sellers.status, "APPROVED")))
    .orderBy(desc(follows.createdAt));
}

// ---------------------------------------------------------------------------
// Bag
// ---------------------------------------------------------------------------

export async function addToBag(db: Db, input: { userId: string; listingId: string }) {
  const [visible] = await visibleListingIds(db, [input.listingId]);
  if (!visible) return { ok: false as const, reason: "NOT_FOUND" as const };
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`bag:${input.userId}`}))`);
    const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(bagItems).where(eq(bagItems.userId, input.userId))) as [{ n: number }];
    if (n >= MAX_BAG) return { ok: false as const, reason: "BAG_FULL" as const };
    await tx.insert(bagItems).values({ userId: input.userId, listingId: visible }).onConflictDoNothing();
    return { ok: true as const };
  });
}

export async function removeFromBag(db: Db, input: { userId: string; listingIds: string[] }) {
  if (input.listingIds.length === 0) return;
  await db.delete(bagItems).where(and(eq(bagItems.userId, input.userId), inArray(bagItems.listingId, input.listingIds)));
}

export async function bagListingIds(db: Db, userId: string) {
  const rows = await db.select({ id: bagItems.listingId }).from(bagItems).where(eq(bagItems.userId, userId));
  return rows.map((r) => r.id);
}

/** Folds a guest's device bag into the account, up to the bag limit. */
export async function mergeBag(db: Db, input: { userId: string; listingIds: string[] }) {
  const ids = await visibleListingIds(db, validIds(input.listingIds));
  let merged = 0;
  for (const listingId of ids) {
    const r = await addToBag(db, { userId: input.userId, listingId });
    if (r.ok) merged++;
    else if (r.reason === "BAG_FULL") break;
  }
  return { merged };
}

export type BagGroup = {
  seller: { id: string; handle: string; displayName: string; shippingFeePaise: number; freeShippingAbovePaise: number | null };
  items: (SearchHit & { buyable: boolean })[];
  /** Totals over items that can be bought now. */
  subtotalPaise: number;
  shippingPaise: number;
  /** How much more to spend at this store for free shipping, when it's close enough to mention. */
  freeShippingGapPaise: number | null;
};

/**
 * The bag grouped by store: each store checks out separately. Prices and availability are
 * read now, but nothing is reserved until checkout.
 */
export async function getBag(db: Db, userId: string): Promise<BagGroup[]> {
  const rows = await db
    .select({ listingId: bagItems.listingId, sellerId: listings.sellerId })
    .from(bagItems)
    .innerJoin(listings, eq(listings.id, bagItems.listingId))
    .where(eq(bagItems.userId, userId))
    .orderBy(asc(bagItems.createdAt));
  if (rows.length === 0) return [];
  const cards = new Map((await listingCardsByIds(db, rows.map((r) => r.listingId))).map((c) => [c.id, c]));
  const sellerRows = await db
    .select()
    .from(sellers)
    .where(inArray(sellers.id, [...new Set(rows.map((r) => r.sellerId))]));

  const groups: BagGroup[] = [];
  for (const s of sellerRows) {
    const items = rows
      .filter((r) => r.sellerId === s.id)
      .map((r) => cards.get(r.listingId))
      .filter((c): c is SearchHit => c !== undefined)
      .map((c) => ({ ...c, buyable: s.status === "APPROVED" && c.status === "AVAILABLE" }));
    if (items.length === 0) continue;
    const subtotal = items.filter((i) => i.buyable).reduce((t, i) => t + i.pricePaise, 0);
    const free = s.freeShippingAbovePaise !== null && subtotal >= s.freeShippingAbovePaise;
    const gap = s.freeShippingAbovePaise !== null && !free && subtotal > 0 ? s.freeShippingAbovePaise - subtotal : null;
    groups.push({
      seller: { id: s.id, handle: s.handle, displayName: s.displayName, shippingFeePaise: s.shippingFeePaise, freeShippingAbovePaise: s.freeShippingAbovePaise },
      items,
      subtotalPaise: subtotal,
      shippingPaise: subtotal === 0 || free ? 0 : s.shippingFeePaise,
      // Only nudge when one more piece would plausibly get there (within ₹1,000).
      freeShippingGapPaise: gap !== null && gap <= 100_000 ? gap : null,
    });
  }
  return groups;
}
