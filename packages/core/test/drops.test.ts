import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drops, holds, listingPhotos, listings, outboxEvents } from "@yolt/db";
import {
  addListingToDrop,
  cancelDrop,
  createCheckout,
  createDrop,
  endFinishedDrops,
  getDropLiveState,
  getDropView,
  listPublicDrops,
  openDueDrops,
  queueDropReminders,
  removeListingFromDrop,
  scheduleDrop,
  setDropReminder,
} from "../src";
import { createListing, createSeller, createUser, testDb, truncateAll } from "./fixtures";

const { db, close } = testDb(30);
afterAll(close);
beforeEach(() => truncateAll(db));

const minutes = (n: number) => n * 60_000;

/** A publishable listing: the fixture's complete fields plus front, back, label and flaw photos (it describes a flaw). */
async function readyListing(sellerId: string, opts: Parameters<typeof createListing>[2] = {}) {
  const l = await createListing(db, sellerId, opts);
  await db.insert(listingPhotos).values(
    (["FRONT", "BACK", "LABEL", "FLAW"] as const).map((kind, position) => ({ listingId: l.id, kind, position, url: `https://media.test/${l.id}/${kind}.webp` })),
  );
  return l;
}
const statusOf = async (id: string) => (await db.select().from(listings).where(eq(listings.id, id)))[0]!.status;

/** A scheduled drop starting at `t0 + 30 min`, with `n` complete listings. */
async function scheduledDrop(n = 2, max: 1 | 2 = 2) {
  const t0 = new Date();
  const { seller, owner } = await createSeller(db);
  const items = [];
  for (let i = 0; i < n; i++) items.push(await readyListing(seller.id, { status: "DRAFT", publishedAt: null }));
  const startsAt = new Date(t0.getTime() + minutes(30));
  const d = await createDrop(db, { sellerId: seller.id, title: "Winter Vintage Drop", startsAt, maxHoldsPerBuyer: max, now: t0 });
  if (!d.ok) throw new Error(d.reason);
  for (const l of items) {
    const r = await addListingToDrop(db, { sellerId: seller.id, dropId: d.dropId, listingId: l.id });
    if (!r.ok) throw new Error(`${r.reason} ${JSON.stringify("missing" in r ? r.missing : "")}`);
  }
  const s = await scheduleDrop(db, { sellerId: seller.id, dropId: d.dropId, actorUserId: owner.id, now: t0 });
  if (!s.ok) throw new Error(s.reason);
  return { seller, owner, items, dropId: d.dropId, startsAt, t0 };
}
const after = (d: Date, ms: number) => new Date(d.getTime() + ms);

describe("building and scheduling", () => {
  it("validates the start time and title", async () => {
    const { seller } = await createSeller(db);
    const now = new Date();
    expect(await createDrop(db, { sellerId: seller.id, title: "Drop", startsAt: after(now, minutes(5)), maxHoldsPerBuyer: 2, now })).toEqual({ ok: false, reason: "TOO_SOON" });
    expect(await createDrop(db, { sellerId: seller.id, title: "Drop", startsAt: after(now, 90 * 86_400_000), maxHoldsPerBuyer: 2, now })).toEqual({ ok: false, reason: "TOO_FAR" });
    expect(await createDrop(db, { sellerId: seller.id, title: "x", startsAt: after(now, minutes(30)), maxHoldsPerBuyer: 2, now })).toEqual({ ok: false, reason: "INVALID_TITLE" });
  });

  it("scheduling locks items as Coming soon; they can't be bought early", async () => {
    const d = await scheduledDrop();
    for (const l of d.items) expect(await statusOf(l.id)).toBe("SCHEDULED");
    const buyer = await createUser(db);
    const early = await createCheckout(db, { buyerId: buyer.id, listingIds: [d.items[0]!.id], now: after(d.t0, minutes(5)) });
    expect(early).toMatchObject({ ok: false, reason: "UNAVAILABLE" });
    // A scheduled drop can't be edited.
    expect(await removeListingFromDrop(db, { sellerId: d.seller.id, dropId: d.dropId, listingId: d.items[0]!.id })).toEqual({ ok: false, reason: "DROP_LOCKED" });
  });

  it("only complete, free items from the seller's own stock can join; empty drops can't be scheduled", async () => {
    const { seller, owner } = await createSeller(db);
    const now = new Date();
    const d = await createDrop(db, { sellerId: seller.id, title: "Drop", startsAt: after(now, minutes(30)), maxHoldsPerBuyer: 1, now });
    if (!d.ok) throw new Error();
    const incomplete = await createListing(db, seller.id, { status: "DRAFT", publishedAt: null, title: null, category: null, condition: null, pricePaise: null });
    const sold = await readyListing(seller.id, { status: "SOLD", soldAt: now });
    const { seller: other } = await createSeller(db);
    const theirs = await createListing(db, other.id);
    expect(await addListingToDrop(db, { sellerId: seller.id, dropId: d.dropId, listingId: incomplete.id })).toMatchObject({ ok: false, reason: "INCOMPLETE" });
    expect(await addListingToDrop(db, { sellerId: seller.id, dropId: d.dropId, listingId: sold.id })).toEqual({ ok: false, reason: "NOT_JOINABLE" });
    expect(await addListingToDrop(db, { sellerId: seller.id, dropId: d.dropId, listingId: theirs.id })).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await scheduleDrop(db, { sellerId: seller.id, dropId: d.dropId, actorUserId: owner.id, now })).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("if an added item gets reserved before scheduling, nothing is scheduled", async () => {
    const { seller, owner } = await createSeller(db);
    const now = new Date();
    const [a, b] = [await readyListing(seller.id), await readyListing(seller.id)];
    const d = await createDrop(db, { sellerId: seller.id, title: "Drop", startsAt: after(now, minutes(30)), maxHoldsPerBuyer: 1, now });
    if (!d.ok) throw new Error();
    await addListingToDrop(db, { sellerId: seller.id, dropId: d.dropId, listingId: a.id });
    await addListingToDrop(db, { sellerId: seller.id, dropId: d.dropId, listingId: b.id });
    const buyer = await createUser(db);
    await createCheckout(db, { buyerId: buyer.id, listingIds: [b.id], now });
    expect(await scheduleDrop(db, { sellerId: seller.id, dropId: d.dropId, actorUserId: owner.id, now })).toEqual({ ok: false, reason: "ITEMS_CHANGED", listingIds: [b.id] });
    expect(await statusOf(a.id)).toBe("AVAILABLE");
  });
});

describe("opening", () => {
  it("the sweep opens a due drop: items become available with the drop's start as publish time", async () => {
    const d = await scheduledDrop();
    expect(await openDueDrops(db, { now: after(d.startsAt, -1000) })).toEqual({ opened: 0 });
    expect(await openDueDrops(db, { now: d.startsAt })).toEqual({ opened: 1 });
    const [l] = await db.select().from(listings).where(eq(listings.id, d.items[0]!.id));
    expect(l!.status).toBe("AVAILABLE");
    expect(l!.publishedAt).toEqual(d.startsAt);
    expect(await openDueDrops(db, { now: d.startsAt })).toEqual({ opened: 0 }); // idempotent
  });

  it("the first claim at opening time opens the drop itself, without waiting for the sweep", async () => {
    const d = await scheduledDrop();
    const buyer = await createUser(db);
    const r = await createCheckout(db, { buyerId: buyer.id, listingIds: [d.items[0]!.id], now: after(d.startsAt, 50) });
    expect(r.ok).toBe(true);
    const [drop] = await db.select().from(drops).where(eq(drops.id, d.dropId));
    expect(drop!.status).toBe("LIVE");
    const [hold] = await db.select().from(holds);
    expect(hold!.source).toBe("DROP_CLAIM");
  });

  it("50 buyers claiming one piece at the opening second: exactly one gets it", async () => {
    const d = await scheduledDrop(1);
    const buyers = await Promise.all(Array.from({ length: 50 }, () => createUser(db)));
    const results = await Promise.all(buyers.map((b) => createCheckout(db, { buyerId: b.id, listingIds: [d.items[0]!.id], now: d.startsAt })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "UNAVAILABLE")).toHaveLength(49);
  });
});

describe("per-buyer limit", () => {
  it("a buyer can hold at most the drop's limit at once", async () => {
    const d = await scheduledDrop(3, 2);
    const buyer = await createUser(db);
    const at = after(d.startsAt, 1000);
    expect((await createCheckout(db, { buyerId: buyer.id, listingIds: [d.items[0]!.id], now: at })).ok).toBe(true);
    expect((await createCheckout(db, { buyerId: buyer.id, listingIds: [d.items[1]!.id], now: at })).ok).toBe(true);
    expect(await createCheckout(db, { buyerId: buyer.id, listingIds: [d.items[2]!.id], now: at })).toEqual({
      ok: false,
      reason: "DROP_LIMIT",
      dropId: d.dropId,
      maxHoldsPerBuyer: 2,
    });
    // The refused item stays available for others.
    expect(await statusOf(d.items[2]!.id)).toBe("AVAILABLE");
  });

  it("holds the limit when one buyer claims from several tabs at once", async () => {
    const d = await scheduledDrop(4, 1);
    const buyer = await createUser(db);
    const results = await Promise.all(d.items.map((l) => createCheckout(db, { buyerId: buyer.id, listingIds: [l.id], now: d.startsAt })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("an expired hold frees the buyer's slot", async () => {
    const d = await scheduledDrop(2, 1);
    const buyer = await createUser(db);
    await createCheckout(db, { buyerId: buyer.id, listingIds: [d.items[0]!.id], now: d.startsAt });
    const later = after(d.startsAt, minutes(6)); // the 5-minute hold has lapsed
    expect((await createCheckout(db, { buyerId: buyer.id, listingIds: [d.items[1]!.id], now: later })).ok).toBe(true);
  });
});

describe("cancel, end, reminders and reads", () => {
  it("cancel before opening withdraws the items; after opening it's refused", async () => {
    const d = await scheduledDrop();
    expect((await cancelDrop(db, { sellerId: d.seller.id, dropId: d.dropId, actorUserId: d.owner.id, now: d.t0 })).ok).toBe(true);
    expect(await statusOf(d.items[0]!.id)).toBe("WITHDRAWN");
    const e = await scheduledDrop();
    await openDueDrops(db, { now: e.startsAt });
    expect(await cancelDrop(db, { sellerId: e.seller.id, dropId: e.dropId, actorUserId: e.owner.id, now: e.startsAt })).toEqual({ ok: false, reason: "ALREADY_OPEN" });
  });

  it("ends a live drop once nothing is left to buy", async () => {
    const d = await scheduledDrop(1);
    await openDueDrops(db, { now: d.startsAt });
    expect(await endFinishedDrops(db)).toEqual({ ended: 0 });
    await db.update(listings).set({ status: "SOLD", soldAt: new Date() }).where(eq(listings.id, d.items[0]!.id));
    expect(await endFinishedDrops(db)).toEqual({ ended: 1 });
  });

  it("reminders: counted, queued once 15 minutes before", async () => {
    const d = await scheduledDrop();
    const [u, v] = [await createUser(db), await createUser(db)];
    await setDropReminder(db, { userId: u.id, dropId: d.dropId, on: true });
    await setDropReminder(db, { userId: v.id, dropId: d.dropId, on: true });
    await setDropReminder(db, { userId: v.id, dropId: d.dropId, on: false });
    expect(await queueDropReminders(db, { now: after(d.startsAt, -minutes(20)) })).toEqual({ queued: 0 });
    expect(await queueDropReminders(db, { now: after(d.startsAt, -minutes(10)) })).toEqual({ queued: 1 });
    expect(await queueDropReminders(db, { now: after(d.startsAt, -minutes(5)) })).toEqual({ queued: 0 });
    const [evt] = await db.select().from(outboxEvents).where(eq(outboxEvents.type, "drop.starting_soon"));
    expect(evt!.payload).toMatchObject({ dropId: d.dropId, reminders: 1 });
  });

  it("public views: never drafts; the page opens a due drop; live state lists item statuses", async () => {
    const d = await scheduledDrop(2);
    const { seller } = await createSeller(db);
    const draft = await createDrop(db, { sellerId: seller.id, title: "Secret", startsAt: after(new Date(), minutes(40)), maxHoldsPerBuyer: 1 });
    expect(await getDropView(db, draft.ok ? draft.dropId : "")).toBeNull();
    expect((await listPublicDrops(db)).map((x) => x.id)).toEqual([d.dropId]);

    const before = await getDropView(db, d.dropId, d.t0);
    expect(before!.items.map((i) => i.status)).toEqual(["SCHEDULED", "SCHEDULED"]);
    const live = await getDropLiveState(db, d.dropId, d.startsAt);
    expect(live!.status).toBe("LIVE");
    expect(live!.items.map((i) => i.status)).toEqual(["AVAILABLE", "AVAILABLE"]);
  });
});
