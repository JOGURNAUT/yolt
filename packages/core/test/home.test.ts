import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { homepageSlots, savedItems, sellers } from "@yolt/db";
import { eq } from "drizzle-orm";
import { createSlot, getHomeData, JUST_SOLD_WINDOW_DAYS, TRENDING_MIN_ITEMS, TRENDING_MIN_SAVES, TRENDING_WINDOW_DAYS } from "../src";
import { createListing, createSeller, createUser, testDb, truncateAll } from "./fixtures";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));

const DAY = 86_400_000;
const now = new Date();
const ago = (days: number) => new Date(now.getTime() - days * DAY);

/** `n` different buyers save the listing at `at`. */
async function saves(listingId: string, n: number, at = new Date(now.getTime() - 3_600_000)) {
  for (let i = 0; i < n; i++) {
    const u = await createUser(db);
    await db.insert(savedItems).values({ userId: u.id, listingId, createdAt: at });
  }
}

/** Four pieces with enough saves to trend. */
async function trendingSet(sellerId: string) {
  const out = [];
  for (let i = 0; i < TRENDING_MIN_ITEMS; i++) {
    const l = await createListing(db, sellerId, { title: `Trending ${i}`, publishedAt: ago(10 + i) });
    await saves(l.id, TRENDING_MIN_SAVES + (TRENDING_MIN_ITEMS - i)); // most saved first
    out.push(l);
  }
  return out;
}

describe("trending", () => {
  it("lists pieces with enough saves in the last 7 days, most saved first", async () => {
    const { seller } = await createSeller(db);
    const set = await trendingSet(seller.id);
    const quiet = await createListing(db, seller.id, { title: "Two saves only" });
    await saves(quiet.id, TRENDING_MIN_SAVES - 1);

    const home = await getHomeData(db, now);
    expect(home.trending.mode).toBe("TRENDING");
    expect(home.trending.items.map((i) => i.id)).toEqual(set.map((l) => l.id));
  });

  it("falls back to the newest pieces, labelled JUST_DROPPED, when fewer than 4 qualify", async () => {
    const { seller } = await createSeller(db);
    const trending = await createListing(db, seller.id, { title: "Old but loved", publishedAt: ago(20) });
    await saves(trending.id, TRENDING_MIN_SAVES + 2);
    const newest = await createListing(db, seller.id, { title: "Newest", publishedAt: ago(0.1) });
    const middle = await createListing(db, seller.id, { title: "Middle", publishedAt: ago(2) });

    const home = await getHomeData(db, now);
    expect(home.trending.mode).toBe("JUST_DROPPED");
    expect(home.trending.items.map((i) => i.id)).toEqual([newest.id, middle.id, trending.id]);
  });

  it("ignores saves older than the window", async () => {
    const { seller } = await createSeller(db);
    for (let i = 0; i < TRENDING_MIN_ITEMS; i++) {
      const l = await createListing(db, seller.id);
      await saves(l.id, TRENDING_MIN_SAVES, ago(TRENDING_WINDOW_DAYS + 1));
    }
    expect((await getHomeData(db, now)).trending.mode).toBe("JUST_DROPPED");
  });

  it("counts saves exactly at the threshold and excludes sold, draft and suspended-store pieces", async () => {
    const { seller } = await createSeller(db);
    const set = await trendingSet(seller.id);
    const { seller: suspended } = await createSeller(db, { status: "SUSPENDED" });
    const hidden = [
      await createListing(db, seller.id, { status: "SOLD", soldAt: now }),
      await createListing(db, seller.id, { status: "DRAFT", publishedAt: null }),
      await createListing(db, suspended.id),
    ];
    for (const h of hidden) await saves(h.id, 10);

    const ids = (await getHomeData(db, now)).trending.items.map((i) => i.id);
    expect(ids).toEqual(set.map((l) => l.id));
    for (const h of hidden) expect(ids).not.toContain(h.id);
  });

  it("the fallback also hides drafts, sold pieces and suspended stores", async () => {
    const { seller } = await createSeller(db);
    const { seller: suspended } = await createSeller(db, { status: "SUSPENDED" });
    const ok = await createListing(db, seller.id);
    await createListing(db, seller.id, { status: "DRAFT", publishedAt: null });
    await createListing(db, seller.id, { status: "SOLD", soldAt: now });
    await createListing(db, suspended.id);
    const home = await getHomeData(db, now);
    expect(home.trending).toMatchObject({ mode: "JUST_DROPPED" });
    expect(home.trending.items.map((i) => i.id)).toEqual([ok.id]);
  });

  it("is empty (JUST_DROPPED, no items) on an empty marketplace", async () => {
    expect((await getHomeData(db, now)).trending).toEqual({ mode: "JUST_DROPPED", items: [] });
  });
});

describe("just sold", () => {
  it("shows pieces sold in the last 30 days, newest first, from approved stores", async () => {
    const { seller } = await createSeller(db);
    const { seller: suspended } = await createSeller(db, { status: "SUSPENDED" });
    const recent = await createListing(db, seller.id, { status: "SOLD", soldAt: ago(1) });
    const earlier = await createListing(db, seller.id, { status: "SOLD", soldAt: ago(JUST_SOLD_WINDOW_DAYS - 1) });
    await createListing(db, seller.id, { status: "SOLD", soldAt: ago(JUST_SOLD_WINDOW_DAYS + 1) });
    await createListing(db, seller.id, { status: "SOLD_ELSEWHERE", soldAt: ago(1) });
    await createListing(db, suspended.id, { status: "SOLD", soldAt: ago(1) });

    expect((await getHomeData(db, now)).justSold.map((i) => i.id)).toEqual([recent.id, earlier.id]);
  });

  it("returns at most 12", async () => {
    const { seller } = await createSeller(db);
    for (let i = 0; i < 14; i++) await createListing(db, seller.id, { status: "SOLD", soldAt: ago(1 + i / 100) });
    expect((await getHomeData(db, now)).justSold).toHaveLength(12);
  });
});

describe("grails and the edit", () => {
  async function admin() {
    return createUser(db, "Curator");
  }

  it("grails are empty until staff curate them, and never auto-fill", async () => {
    const { seller } = await createSeller(db);
    await createListing(db, seller.id, { pricePaise: 900_000 });
    expect((await getHomeData(db, now)).grails).toEqual([]);
    expect((await getHomeData(db, now)).edit).toBeNull();
  });

  it("returns the curated pieces in curated order, dropping ones that are no longer live", async () => {
    const { seller } = await createSeller(db);
    const a = await createListing(db, seller.id);
    const b = await createListing(db, seller.id);
    const c = await createListing(db, seller.id);
    const curator = await admin();
    const r = await createSlot(db, { adminUserId: curator.id, kind: "GRAILS", listingIds: [c.id, a.id, b.id], reason: "Spring grails" });
    expect(r.ok).toBe(true);
    expect((await getHomeData(db, now)).grails.map((i) => i.id)).toEqual([c.id, a.id, b.id]);

    const { listings } = await import("@yolt/db");
    await db.update(listings).set({ status: "SOLD", soldAt: now }).where(eq(listings.id, a.id));
    expect((await getHomeData(db, now)).grails.map((i) => i.id)).toEqual([c.id, b.id]);
  });

  it("the newest current slot wins; expired and upcoming windows are ignored", async () => {
    const { seller } = await createSeller(db);
    const old = await createListing(db, seller.id);
    const fresh = await createListing(db, seller.id);
    const curator = await admin();
    const mk = (listingId: string, createdAt: Date, startsAt: Date | null, endsAt: Date | null) =>
      createSlot(db, { adminUserId: curator.id, kind: "GRAILS", listingIds: [listingId], reason: "test slot", startsAt, endsAt, now: createdAt });

    await mk(old.id, ago(5), null, null); // current, older
    await mk(fresh.id, ago(1), ago(1), new Date(now.getTime() + DAY)); // current, newer
    expect((await getHomeData(db, now)).grails.map((i) => i.id)).toEqual([fresh.id]);

    // The newer slot expires: the older, open-ended one is shown again.
    expect((await getHomeData(db, new Date(now.getTime() + 2 * DAY))).grails.map((i) => i.id)).toEqual([old.id]);

    // A slot that hasn't started yet isn't shown.
    await mk(fresh.id, ago(0.5), new Date(now.getTime() + DAY), null);
    expect((await getHomeData(db, now)).grails.map((i) => i.id)).toEqual([fresh.id]);
  });

  it("an expired-only curation shows nothing", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const curator = await admin();
    await createSlot(db, { adminUserId: curator.id, kind: "GRAILS", listingIds: [l.id], reason: "Ended promo", startsAt: ago(10), endsAt: ago(1), now: ago(10) });
    expect((await getHomeData(db, now)).grails).toEqual([]);
  });

  it("hides curated pieces from a suspended store", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const curator = await admin();
    await createSlot(db, { adminUserId: curator.id, kind: "GRAILS", listingIds: [l.id], reason: "Grail pick" });
    await db.update(sellers).set({ status: "SUSPENDED" }).where(eq(sellers.id, seller.id));
    expect((await getHomeData(db, now)).grails).toEqual([]);
  });

  it("the edit comes with its title, and is null once none of its pieces are live", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const curator = await admin();
    await createSlot(db, { adminUserId: curator.id, kind: "EDIT", title: "Monsoon layers", listingIds: [l.id], reason: "Weekly edit" });
    const edit = (await getHomeData(db, now)).edit;
    expect(edit?.title).toBe("Monsoon layers");
    expect(edit?.items.map((i) => i.id)).toEqual([l.id]);

    const { listings } = await import("@yolt/db");
    await db.update(listings).set({ status: "WITHDRAWN" }).where(eq(listings.id, l.id));
    expect((await getHomeData(db, now)).edit).toBeNull();
  });
});

describe("featured store", () => {
  it("falls back to the approved store with the most in-stock pieces", async () => {
    const { seller: small } = await createSeller(db, { displayName: "Small" });
    const { seller: big } = await createSeller(db, { displayName: "Big" });
    const { seller: suspended } = await createSeller(db, { status: "SUSPENDED", displayName: "Suspended" });
    await createListing(db, small.id);
    await createListing(db, big.id);
    await createListing(db, big.id);
    await createListing(db, big.id, { status: "SOLD", soldAt: now });
    for (let i = 0; i < 5; i++) await createListing(db, suspended.id);

    expect((await getHomeData(db, now)).featuredStore).toMatchObject({ id: big.id, inStockCount: 2, source: "MOST_STOCKED" });
  });

  it("is null when no approved store has anything in stock", async () => {
    await createSeller(db);
    expect((await getHomeData(db, now)).featuredStore).toBeNull();
  });

  it("uses the curated store, until its window ends or it is suspended", async () => {
    const { seller: big } = await createSeller(db);
    const { seller: chosen } = await createSeller(db, { displayName: "Chosen" });
    await createListing(db, big.id);
    await createListing(db, big.id);
    const curator = await createUser(db);
    await createSlot(db, { adminUserId: curator.id, kind: "FEATURED_STORE", sellerId: chosen.id, reason: "Store of the week", endsAt: new Date(now.getTime() + DAY) });

    expect((await getHomeData(db, now)).featuredStore).toMatchObject({ id: chosen.id, source: "CURATED" });
    expect((await getHomeData(db, new Date(now.getTime() + 2 * DAY))).featuredStore).toMatchObject({ id: big.id, source: "MOST_STOCKED" });

    await db.update(sellers).set({ status: "SUSPENDED" }).where(eq(sellers.id, chosen.id));
    expect((await getHomeData(db, now)).featuredStore).toMatchObject({ id: big.id });
    expect(await db.select().from(homepageSlots)).toHaveLength(1);
  });
});
