import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { sellers } from "@yolt/db";
import {
  addToBag,
  bagListingIds,
  createCheckout,
  followerCount,
  followSeller,
  getBag,
  getSavedListings,
  handlePaymentEvent,
  isFollowing,
  MAX_BAG,
  mergeBag,
  mergeSaves,
  releaseCheckout,
  saveListing,
  savedListingIds,
  setOrderShippingAddress,
  startPayment,
  unfollowSeller,
  unsaveListing,
} from "../src";
import { createListing, createSeller, createUser, TEST_ADDRESS, testDb, truncateAll } from "./fixtures";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));

describe("saved items", () => {
  it("save, list (sold items stay), unsave; drafts can't be saved", async () => {
    const { seller } = await createSeller(db);
    const [a, b] = [await createListing(db, seller.id), await createListing(db, seller.id, { status: "SOLD", soldAt: new Date() })];
    const draft = await createListing(db, seller.id, { status: "DRAFT", publishedAt: null });
    const u = await createUser(db);
    expect((await saveListing(db, { userId: u.id, listingId: a.id })).ok).toBe(true);
    expect((await saveListing(db, { userId: u.id, listingId: a.id })).ok).toBe(true); // idempotent
    expect((await saveListing(db, { userId: u.id, listingId: b.id })).ok).toBe(true);
    expect(await saveListing(db, { userId: u.id, listingId: draft.id })).toEqual({ ok: false, reason: "NOT_FOUND" });
    const saved = await getSavedListings(db, u.id);
    expect(saved.map((s) => s.status).sort()).toEqual(["AVAILABLE", "SOLD"]);
    await unsaveListing(db, { userId: u.id, listingId: a.id });
    expect(await savedListingIds(db, u.id)).toEqual([b.id]);
  });

  it("merges guest saves without duplicates, ignoring junk and hidden items", async () => {
    const { seller } = await createSeller(db);
    const a = await createListing(db, seller.id);
    const draft = await createListing(db, seller.id, { status: "DRAFT", publishedAt: null });
    const u = await createUser(db);
    await saveListing(db, { userId: u.id, listingId: a.id });
    const r = await mergeSaves(db, { userId: u.id, listingIds: [a.id, a.id, draft.id, "not-a-uuid", "00000000-0000-0000-0000-000000000000"] });
    expect(r.merged).toBe(1);
    expect(await savedListingIds(db, u.id)).toEqual([a.id]);
  });
});

describe("follows", () => {
  it("follow/unfollow with a count; can't follow your own or a suspended store", async () => {
    const { seller, owner } = await createSeller(db);
    const [u, v] = [await createUser(db), await createUser(db)];
    await followSeller(db, { userId: u.id, sellerId: seller.id });
    await followSeller(db, { userId: u.id, sellerId: seller.id });
    await followSeller(db, { userId: v.id, sellerId: seller.id });
    expect(await followerCount(db, seller.id)).toBe(2);
    expect(await isFollowing(db, { userId: u.id, sellerId: seller.id })).toBe(true);
    await unfollowSeller(db, { userId: u.id, sellerId: seller.id });
    expect(await followerCount(db, seller.id)).toBe(1);
    expect(await followSeller(db, { userId: owner.id, sellerId: seller.id })).toEqual({ ok: false, reason: "OWN_STORE" });
    await db.update(sellers).set({ status: "SUSPENDED" }).where(eq(sellers.id, seller.id));
    expect(await followSeller(db, { userId: u.id, sellerId: seller.id })).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});

describe("bag", () => {
  it("groups by store with shipping rules and marks what can be bought now", async () => {
    const { seller: s1 } = await createSeller(db, { displayName: "Store One" }); // ₹79 shipping, free above ₹1,999
    const { seller: s2 } = await createSeller(db, { displayName: "Store Two" });
    const u = await createUser(db);
    const a = await createListing(db, s1.id, { pricePaise: 129900 });
    const b = await createListing(db, s1.id, { pricePaise: 49900, status: "SOLD", soldAt: new Date() });
    const c = await createListing(db, s2.id, { pricePaise: 250000 });
    for (const l of [a, b, c]) await addToBag(db, { userId: u.id, listingId: l.id });

    const bag = await getBag(db, u.id);
    const one = bag.find((g) => g.seller.displayName === "Store One")!;
    expect(one.items.map((i) => [i.id, i.buyable])).toEqual([[a.id, true], [b.id, false]]);
    expect([one.subtotalPaise, one.shippingPaise, one.freeShippingGapPaise]).toEqual([129900, 7900, 70000]);
    const two = bag.find((g) => g.seller.displayName === "Store Two")!;
    expect([two.subtotalPaise, two.shippingPaise, two.freeShippingGapPaise]).toEqual([250000, 0, null]);
  });

  it("caps the bag, even under concurrent adds, and merges guest bags up to the cap", async () => {
    const { seller } = await createSeller(db);
    const u = await createUser(db);
    const ls = [];
    for (let i = 0; i < MAX_BAG + 5; i++) ls.push(await createListing(db, seller.id));
    const results = await Promise.all(ls.map((l) => addToBag(db, { userId: u.id, listingId: l.id })));
    expect(results.filter((r) => r.ok)).toHaveLength(MAX_BAG);

    const v = await createUser(db);
    expect((await mergeBag(db, { userId: v.id, listingIds: ls.map((l) => l.id) })).merged).toBe(MAX_BAG);
  });

  it("paying removes those items from the bag; abandoning checkout keeps them", async () => {
    const { seller } = await createSeller(db);
    const [kept, bought] = [await createListing(db, seller.id), await createListing(db, seller.id)];
    const u = await createUser(db);
    await addToBag(db, { userId: u.id, listingId: kept.id });
    await addToBag(db, { userId: u.id, listingId: bought.id });

    const abandoned = await createCheckout(db, { buyerId: u.id, listingIds: [kept.id] });
    await releaseCheckout(db, { orderId: abandoned.ok ? abandoned.orderId : "", buyerId: u.id });
    expect((await bagListingIds(db, u.id)).sort()).toEqual([kept.id, bought.id].sort());

    const r = await createCheckout(db, { buyerId: u.id, listingIds: [bought.id] });
    if (!r.ok) throw new Error(r.reason);
    await setOrderShippingAddress(db, { orderId: r.orderId, buyerId: u.id, address: TEST_ADDRESS });
    const started = await startPayment(db, { orderId: r.orderId, buyerId: u.id, provider: "sandbox", providerOrderId: `p_${r.orderId}` });
    if (!started.ok) throw new Error(started.reason);
    await handlePaymentEvent(db, { provider: "sandbox", providerEventId: `e_${r.orderId}`, type: "payment.succeeded", providerOrderId: `p_${r.orderId}`, amountPaise: started.amountPaise, currency: "INR" });
    expect(await bagListingIds(db, u.id)).toEqual([kept.id]);
  });

  it("items from a suspended store stay in the bag but can't be bought", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const u = await createUser(db);
    await addToBag(db, { userId: u.id, listingId: l.id });
    await db.update(sellers).set({ status: "SUSPENDED" }).where(eq(sellers.id, seller.id));
    const [group] = await getBag(db, u.id);
    expect(group!.items.map((i) => i.buyable)).toEqual([false]);
    expect(group!.subtotalPaise).toBe(0);
  });
});
