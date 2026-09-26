import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { parseSearchParams } from "@yolt/shared";
import { sellers } from "@yolt/db";
import { searchListings } from "../src";
import { createListing, createSeller, testDb, truncateAll } from "./fixtures";

const { db, close } = testDb(10);
afterAll(close);

const search = (qs: string) => searchListings(db, parseSearchParams(new URLSearchParams(qs)));
const titles = async (qs: string) => (await search(qs)).hits.map((h) => h.title).sort();

beforeAll(async () => {
  await truncateAll(db);
  const { seller } = await createSeller(db, { handle: "secondloop", displayName: "Second Loop" });
  const { seller: other } = await createSeller(db, { handle: "denimden", displayName: "Denim Den" });
  const { seller: suspended } = await createSeller(db, { handle: "gone", displayName: "Gone Store" });

  const add = (sellerId: string, o: Parameters<typeof createListing>[2]) => createListing(db, sellerId, o);
  await add(seller.id, { title: "Vintage Levi's 501 jeans", category: "jeans", brandDeclared: "Levi's", tagSize: "W32", measurements: { basis: "FLAT", waistCm: 41, lengthCm: 104 }, pricePaise: 129900, condition: "GOOD" });
  await add(other.id, { title: "Wide leg denim", category: "jeans", tagSize: "w30", measurements: { basis: "AROUND", waistCm: 76, lengthCm: 100 }, pricePaise: 99900, condition: "LIKE_NEW" });
  await add(seller.id, { title: "Brown suede jacket", category: "jackets", tagSize: "L", measurements: { basis: "FLAT", chestCm: 50, lengthCm: 70 }, pricePaise: 189900, condition: "GOOD" });
  await add(seller.id, { title: "Black bomber jacket", category: "jackets", tagSize: "M", measurements: { basis: "FLAT", chestCm: 60 }, pricePaise: 149900, condition: "FAIR" });
  await add(seller.id, { title: "Y2K graphic baby top", category: "tops", tagSize: "S", measurements: { basis: "AROUND", chestCm: 100 }, pricePaise: 54900, condition: "GOOD" });
  await add(seller.id, { title: "Plain white top", category: "tops", tagSize: "S", measurements: {}, pricePaise: 39900, condition: "LIKE_NEW" });
  await add(seller.id, { title: "Mystery basis top", category: "tops", tagSize: "S", measurements: { chestCm: 50 }, pricePaise: 45900, condition: "GOOD" });
  await add(seller.id, { title: "Sold Levi's trucker jacket", category: "jackets", brandDeclared: "Levi's", tagSize: "M", status: "SOLD", soldAt: new Date(), pricePaise: 179900, condition: "GOOD" });
  await add(seller.id, { title: "Coming soon Levi's shorts", category: "shorts", brandDeclared: "Levi's", tagSize: "M", status: "SCHEDULED", publishedAt: null, pricePaise: 69900, condition: "GOOD" });
  await add(seller.id, { title: "Draft Levi's jeans", category: "jeans", status: "DRAFT", publishedAt: null, pricePaise: 100000, condition: "GOOD" });
  await add(suspended.id, { title: "Hidden Levi's jeans", category: "jeans", pricePaise: 100000, condition: "GOOD" });
  await db.update(sellers).set({ status: "SUSPENDED" }).where(eq(sellers.id, suspended.id));
});

describe("text matching", () => {
  it("matches brand with or without the apostrophe, and prefixes", async () => {
    expect(await titles("q=levis")).toEqual(["Vintage Levi's 501 jeans"]);
    expect(await titles("q=Levi's")).toEqual(["Vintage Levi's 501 jeans"]);
    expect(await titles("q=lev")).toEqual(["Vintage Levi's 501 jeans"]);
  });

  it("requires every word to match", async () => {
    expect(await titles("q=brown jacket")).toEqual(["Brown suede jacket"]);
  });

  it("maps synonyms to categories: tee → tops, denim → jeans", async () => {
    expect(await titles("q=tee")).toEqual(["Mystery basis top", "Plain white top", "Y2K graphic baby top"]);
    expect(await titles("q=denim")).toEqual(["Vintage Levi's 501 jeans", "Wide leg denim"]);
  });

  it("recovers from typos with close matches, and says so", async () => {
    const r = await search("q=levsi");
    expect(r.mode).toBe("close");
    expect(r.hits.map((h) => h.title)).toEqual(["Vintage Levi's 501 jeans"]);
    expect((await search("q=jaket")).hits.length).toBeGreaterThan(0);
  });

  it("finds nothing for unrelated words, and handles hostile input safely", async () => {
    expect((await search("q=spaceship")).total).toBe(0);
    expect((await search(`q=${encodeURIComponent("'); DROP TABLE listings; --")}`)).total).toBe(0);
    expect((await search(`q=${encodeURIComponent(":* & | ! ( )")}`)).mode).toBe("browse");
  });

  it("suggests matching stores", async () => {
    expect((await search("q=second loop")).stores.map((s) => s.handle)).toEqual(["secondloop"]);
  });
});

describe("visibility", () => {
  it("never shows drafts or suspended stores; sold and coming soon only under their pills", async () => {
    const inStock = await titles("q=levis");
    expect(inStock).not.toContain("Draft Levi's jeans");
    expect(inStock).not.toContain("Hidden Levi's jeans");
    expect(await titles("q=levis&status=sold-out")).toEqual(["Sold Levi's trucker jacket"]);
    expect(await titles("q=levis&status=coming-soon")).toEqual(["Coming soon Levi's shorts"]);
    expect((await search("q=levis")).stockCounts).toEqual({ "in-stock": 1, "sold-out": 1, "coming-soon": 1 });
  });
});

describe("filters", () => {
  it("compares widths as full circumference: flat 50 cm = 100 cm around", async () => {
    expect(await titles("chest=96-104")).toEqual(["Brown suede jacket", "Y2K graphic baby top"]);
    expect(await titles("chest=110-130")).toEqual(["Black bomber jacket"]);
  });

  it("excludes unknown measurements unless asked, and never guesses a missing basis", async () => {
    expect(await titles("cat=tops&chest=90-110")).toEqual(["Y2K graphic baby top"]);
    expect(await titles("cat=tops&chest=90-110&unmeasured=1")).toEqual(["Mystery basis top", "Plain white top", "Y2K graphic baby top"]);
  });

  it("filters waist across flat and around listings", async () => {
    expect(await titles("waist=74-84")).toEqual(["Vintage Levi's 501 jeans", "Wide leg denim"]);
  });

  it("filters by price (rupees), condition, size (any case), brand and store", async () => {
    expect(await titles("price=500-1000")).toEqual(["Wide leg denim", "Y2K graphic baby top"]);
    expect(await titles("cond=FAIR")).toEqual(["Black bomber jacket"]);
    expect(await titles("size=W30")).toEqual(["Wide leg denim"]);
    expect(await titles("brand=levi")).toEqual(["Vintage Levi's 501 jeans"]);
    expect(await titles("store=denimden")).toEqual(["Wide leg denim"]);
  });

  it("category counts ignore the category filter so buyers can switch", async () => {
    const r = await search("cat=jeans");
    expect(r.hits.every((h) => h.category === "jeans")).toBe(true);
    expect(r.categoryCounts.map((c) => c.category).sort()).toEqual(["jackets", "jeans", "tops"]);
  });

  it("sorts by price", async () => {
    const r = await search("cat=jackets&sort=price_asc");
    expect(r.hits.map((h) => h.pricePaise)).toEqual([149900, 189900]);
  });
});

describe("pagination", () => {
  it("pages 24 at a time with a correct total", async () => {
    const { seller } = await createSeller(db, { handle: "bulkstore" });
    for (let i = 0; i < 30; i++) await createListing(db, seller.id, { title: `Bulk item ${i}`, category: "accessories" });
    const p1 = await search("store=bulkstore");
    const p2 = await search("store=bulkstore&page=2");
    expect([p1.total, p1.hits.length, p2.hits.length, p1.pageCount]).toEqual([30, 24, 6, 2]);
    expect(new Set([...p1.hits, ...p2.hits].map((h) => h.id)).size).toBe(30);
  });
});
