import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { holds, listings, orderItems, orders, refunds } from "@yolt/db";
import {
  createCheckout,
  expireHolds,
  handlePaymentEvent,
  markSoldElsewhere,
  releaseCheckout,
  setOrderShippingAddress,
  startPayment,
} from "../src";
import { createListing, createSeller, createUser, testDb, truncateAll } from "./fixtures";

const { db, close } = testDb(20);
afterAll(close);
beforeEach(() => truncateAll(db));

const minutes = (n: number) => n * 60_000;

async function listingStatus(id: string) {
  const [l] = await db.select().from(listings).where(eq(listings.id, id));
  return l!;
}

const ADDRESS = {
  name: "Ananya Sharma",
  phone: "+919876543210",
  line1: "Flat 12, Sunrise Apartments",
  city: "Pune",
  state: "Maharashtra",
  pincode: "411001",
};

/** Sets a delivery address (required before payment), then starts paying. */
async function pay(orderId: string, buyerId: string, opts: { now?: Date; eventId?: string } = {}) {
  const providerOrderId = `cf_${orderId}`;
  await setOrderShippingAddress(db, { orderId, buyerId, address: ADDRESS, now: opts.now });
  const started = await startPayment(db, { orderId, buyerId, provider: "cashfree", providerOrderId, now: opts.now });
  return { started, providerOrderId };
}

function succeeded(providerOrderId: string, amountPaise: number, eventId = `evt_${providerOrderId}`, now?: Date) {
  return handlePaymentEvent(db, {
    provider: "cashfree",
    providerEventId: eventId,
    type: "payment.succeeded",
    providerOrderId,
    providerPaymentId: `pay_${providerOrderId}`,
    amountPaise,
    currency: "INR",
    now,
  });
}

describe("checkout holds", () => {
  it("100 concurrent checkouts for one garment produce exactly one hold", async () => {
    const { seller } = await createSeller(db);
    const listing = await createListing(db, seller.id);
    const buyers = await Promise.all(Array.from({ length: 100 }, (_, i) => createUser(db, `b${i}`)));

    const results = await Promise.all(buyers.map((b) => createCheckout(db, { buyerId: b.id, listingIds: [listing.id] })));

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "UNAVAILABLE")).toHaveLength(99);
    const active = await db.select().from(holds).where(eq(holds.status, "ACTIVE"));
    expect(active).toHaveLength(1);
    expect((await listingStatus(listing.id)).status).toBe("RESERVED");
    expect((await db.select().from(orders)).length).toBe(1);
  });

  it("computes shipping from the seller's rules and snapshots the item", async () => {
    const { seller } = await createSeller(db);
    const cheap = await createListing(db, seller.id, { pricePaise: 54900 });
    const buyer = await createUser(db);

    const r = await createCheckout(db, { buyerId: buyer.id, listingIds: [cheap.id] });
    expect(r.ok && r.totalPaise).toBe(54900 + 7900);

    const [item] = await db.select().from(orderItems);
    expect(item!.snapshot.title).toBe("Vintage Levi's 501");
    expect(item!.snapshot.flaws).toContain("bleach spot");
  });

  it("gives free shipping above the seller's threshold", async () => {
    const { seller } = await createSeller(db);
    const a = await createListing(db, seller.id, { pricePaise: 129900 });
    const b = await createListing(db, seller.id, { pricePaise: 79900 });
    const buyer = await createUser(db);
    const r = await createCheckout(db, { buyerId: buyer.id, listingIds: [a.id, b.id] });
    expect(r.ok && r.totalPaise).toBe(209800);
  });

  it("holds nothing when part of a multi-item checkout is unavailable, and names the missing items", async () => {
    const { seller } = await createSeller(db);
    const a = await createListing(db, seller.id);
    const b = await createListing(db, seller.id);
    const [buyer1, buyer2] = [await createUser(db), await createUser(db)];

    await createCheckout(db, { buyerId: buyer1.id, listingIds: [b.id] });
    const r = await createCheckout(db, { buyerId: buyer2.id, listingIds: [a.id, b.id] });

    expect(r).toEqual({ ok: false, reason: "UNAVAILABLE", unavailableListingIds: [b.id] });
    expect((await listingStatus(a.id)).status).toBe("AVAILABLE");
  });

  it("rejects items from two sellers and buying your own listing", async () => {
    const { seller: s1, owner } = await createSeller(db);
    const { seller: s2 } = await createSeller(db);
    const a = await createListing(db, s1.id);
    const b = await createListing(db, s2.id);
    const buyer = await createUser(db);

    expect(await createCheckout(db, { buyerId: buyer.id, listingIds: [a.id, b.id] })).toEqual({ ok: false, reason: "MULTIPLE_SELLERS" });
    expect(await createCheckout(db, { buyerId: owner.id, listingIds: [a.id] })).toEqual({ ok: false, reason: "OWN_LISTING" });
  });

  it("stops when the price changed since the buyer saw it", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id, { pricePaise: 150000 });
    const buyer = await createUser(db);
    const r = await createCheckout(db, { buyerId: buyer.id, listingIds: [l.id], expectedSubtotalPaise: 129900 });
    expect(r).toEqual({ ok: false, reason: "PRICE_CHANGED", subtotalPaise: 150000 });
    expect((await listingStatus(l.id)).status).toBe("AVAILABLE");
  });

  it("cannot reserve drafts, sold or scheduled items", async () => {
    const { seller } = await createSeller(db);
    const buyer = await createUser(db);
    for (const status of ["DRAFT", "SOLD", "SCHEDULED", "WITHDRAWN"] as const) {
      const l = await createListing(db, seller.id, { status, publishedAt: null });
      const r = await createCheckout(db, { buyerId: buyer.id, listingIds: [l.id] });
      expect(r.ok).toBe(false);
    }
  });
});

describe("expiry", () => {
  it("releases expired holds and expires the order", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const buyer = await createUser(db);
    const t0 = new Date();
    const r = await createCheckout(db, { buyerId: buyer.id, listingIds: [l.id], now: t0 });

    expect(await expireHolds(db, { now: new Date(t0.getTime() + minutes(4)) })).toEqual({ expired: 0 });
    expect(await expireHolds(db, { now: new Date(t0.getTime() + minutes(6)) })).toEqual({ expired: 1 });

    expect((await listingStatus(l.id)).status).toBe("AVAILABLE");
    const [o] = await db.select().from(orders).where(eq(orders.id, r.ok ? r.orderId : ""));
    expect(o!.status).toBe("EXPIRED");
  });

  it("a stale release cannot free a newer buyer's hold", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const [a, b] = [await createUser(db), await createUser(db)];
    const t0 = new Date();

    const first = await createCheckout(db, { buyerId: a.id, listingIds: [l.id], now: t0 });
    await expireHolds(db, { now: new Date(t0.getTime() + minutes(6)) });
    const second = await createCheckout(db, { buyerId: b.id, listingIds: [l.id], now: new Date(t0.getTime() + minutes(7)) });
    expect(second.ok).toBe(true);

    // Buyer A's old tab tries to cancel, and the sweeper runs again: B keeps the item.
    await releaseCheckout(db, { orderId: first.ok ? first.orderId : "", buyerId: a.id });
    await expireHolds(db, { now: new Date(t0.getTime() + minutes(8)) });

    const current = await listingStatus(l.id);
    expect(current.status).toBe("RESERVED");
    const [bHold] = await db.select().from(holds).where(eq(holds.buyerId, b.id));
    expect(current.currentHoldId).toBe(bHold!.id);
  });

  it("checkout frees an item whose hold ran out, without waiting for the sweep", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const [a, b] = [await createUser(db), await createUser(db)];
    const t0 = new Date();
    const first = await createCheckout(db, { buyerId: a.id, listingIds: [l.id], now: t0 });

    const later = new Date(t0.getTime() + minutes(6));
    const results = await Promise.all(
      Array.from({ length: 20 }, () => createCheckout(db, { buyerId: b.id, listingIds: [l.id], now: later })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const [o] = await db.select().from(orders).where(eq(orders.id, first.ok ? first.orderId : ""));
    expect(o!.status).toBe("EXPIRED");
  });

  it("starting payment extends the hold beyond the checkout window", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const buyer = await createUser(db);
    const t0 = new Date();
    const r = await createCheckout(db, { buyerId: buyer.id, listingIds: [l.id], now: t0 });
    const { started } = await pay(r.ok ? r.orderId : "", buyer.id, { now: new Date(t0.getTime() + minutes(4)) });
    expect(started.ok).toBe(true);

    await expireHolds(db, { now: new Date(t0.getTime() + minutes(10)) });
    expect((await listingStatus(l.id)).status).toBe("PAYMENT_PENDING");
  });

  it("refuses to start payment after the hold expired", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const buyer = await createUser(db);
    const t0 = new Date();
    const r = await createCheckout(db, { buyerId: buyer.id, listingIds: [l.id], now: t0 });
    const { started } = await pay(r.ok ? r.orderId : "", buyer.id, { now: new Date(t0.getTime() + minutes(6)) });
    expect(started).toEqual({ ok: false, reason: "HOLD_EXPIRED" });
  });
});

describe("payments", () => {
  async function checkoutAndStart() {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const buyer = await createUser(db);
    const r = await createCheckout(db, { buyerId: buyer.id, listingIds: [l.id] });
    if (!r.ok) throw new Error("checkout failed");
    const { started, providerOrderId } = await pay(r.orderId, buyer.id);
    if (!started.ok) throw new Error("start failed");
    return { l, buyer, seller, orderId: r.orderId, total: r.totalPaise, providerOrderId };
  }

  it("a verified success confirms the order and marks the item sold", async () => {
    const { l, orderId, total, providerOrderId } = await checkoutAndStart();
    expect(await succeeded(providerOrderId, total)).toEqual({ status: "CONFIRMED", orderId });

    expect((await listingStatus(l.id)).status).toBe("SOLD");
    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o!.status).toBe("CONFIRMED");
    expect(o!.dispatchBy).not.toBeNull();
    const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    expect(item!.allocated).toBe(true);
  });

  it("duplicate and concurrent webhooks confirm once", async () => {
    const { orderId, total, providerOrderId } = await checkoutAndStart();
    const results = await Promise.all([
      succeeded(providerOrderId, total, "evt_1"),
      succeeded(providerOrderId, total, "evt_1"),
      succeeded(providerOrderId, total, "evt_2"), // provider retried with a new delivery id
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual(["ALREADY_PROCESSED", "CONFIRMED", "DUPLICATE_EVENT"]);
    expect(await db.select().from(refunds)).toHaveLength(0);
    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o!.status).toBe("CONFIRMED");
  });

  it("an amount mismatch does not confirm the order", async () => {
    const { l, total, providerOrderId, orderId } = await checkoutAndStart();
    expect(await succeeded(providerOrderId, total - 100)).toEqual({ status: "AMOUNT_MISMATCH", orderId });
    expect((await listingStatus(l.id)).status).toBe("PAYMENT_PENDING");
  });

  it("a failed payment lets the buyer retry while the hold lasts, without creating a second attempt while one is open", async () => {
    const { l, buyer, orderId, providerOrderId } = await checkoutAndStart();
    const again = await startPayment(db, { orderId, buyerId: buyer.id, provider: "cashfree", providerOrderId: "cf_second" });
    expect(again.ok && again.existing).toBe(true);

    await handlePaymentEvent(db, {
      provider: "cashfree",
      providerEventId: "evt_fail",
      type: "payment.failed",
      providerOrderId,
      amountPaise: 0,
      currency: "INR",
    });
    expect((await listingStatus(l.id)).status).toBe("RESERVED");
    const retry = await startPayment(db, { orderId, buyerId: buyer.id, provider: "cashfree", providerOrderId: "cf_retry" });
    expect(retry.ok && retry.existing).toBe(false);
  });

  it("a late payment after the item went to someone else is refunded, never double-allocated", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const [slow, fast] = [await createUser(db), await createUser(db)];
    const t0 = new Date();

    const r1 = await createCheckout(db, { buyerId: slow.id, listingIds: [l.id], now: t0 });
    if (!r1.ok) throw new Error();
    const { providerOrderId: slowPay } = await pay(r1.orderId, slow.id, { now: t0 });
    await expireHolds(db, { now: new Date(t0.getTime() + minutes(20)) });

    const r2 = await createCheckout(db, { buyerId: fast.id, listingIds: [l.id], now: new Date(t0.getTime() + minutes(21)) });
    if (!r2.ok) throw new Error();
    const { providerOrderId: fastPay } = await pay(r2.orderId, fast.id, { now: new Date(t0.getTime() + minutes(21)) });
    expect((await succeeded(fastPay, r2.totalPaise)).status).toBe("CONFIRMED");

    const late = await succeeded(slowPay, r1.totalPaise);
    expect(late).toMatchObject({ status: "REFUND_REQUIRED", reason: "ITEM_UNAVAILABLE" });
    const allocations = await db.select().from(orderItems).where(eq(orderItems.allocated, true));
    expect(allocations).toHaveLength(1);
    expect(allocations[0]!.orderId).toBe(r2.orderId);
    const [o1] = await db.select().from(orders).where(eq(orders.id, r1.orderId));
    expect(o1!.status).toBe("NEEDS_REFUND");
  });

  it("a late payment is honoured if the item is still available", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const buyer = await createUser(db);
    const t0 = new Date();
    const r = await createCheckout(db, { buyerId: buyer.id, listingIds: [l.id], now: t0 });
    if (!r.ok) throw new Error();
    const { providerOrderId } = await pay(r.orderId, buyer.id, { now: t0 });
    await expireHolds(db, { now: new Date(t0.getTime() + minutes(20)) });
    expect((await listingStatus(l.id)).status).toBe("AVAILABLE");

    expect((await succeeded(providerOrderId, r.totalPaise)).status).toBe("CONFIRMED");
    expect((await listingStatus(l.id)).status).toBe("SOLD");
  });
});

describe("sold elsewhere", () => {
  it("marks an available item sold elsewhere", async () => {
    const { seller, owner } = await createSeller(db);
    const l = await createListing(db, seller.id);
    expect(await markSoldElsewhere(db, { sellerId: seller.id, listingId: l.id, actorUserId: owner.id })).toEqual({ ok: true });
    expect((await listingStatus(l.id)).status).toBe("SOLD_ELSEWHERE");
  });

  it("refuses while a platform buyer is checking out", async () => {
    const { seller, owner } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const buyer = await createUser(db);
    await createCheckout(db, { buyerId: buyer.id, listingIds: [l.id] });
    expect(await markSoldElsewhere(db, { sellerId: seller.id, listingId: l.id, actorUserId: owner.id })).toEqual({
      ok: false,
      reason: "BUYER_CHECKING_OUT",
    });
  });

  it("a seller cannot touch another seller's listing", async () => {
    const { seller } = await createSeller(db);
    const { seller: other, owner: otherOwner } = await createSeller(db);
    const l = await createListing(db, seller.id);
    expect(await markSoldElsewhere(db, { sellerId: other.id, listingId: l.id, actorUserId: otherOwner.id })).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
  });

  it("racing a checkout and a sold-elsewhere mark yields exactly one outcome", async () => {
    for (let i = 0; i < 10; i++) {
      const { seller, owner } = await createSeller(db);
      const l = await createListing(db, seller.id);
      const buyer = await createUser(db);
      const [checkout, mark] = await Promise.all([
        createCheckout(db, { buyerId: buyer.id, listingIds: [l.id] }),
        markSoldElsewhere(db, { sellerId: seller.id, listingId: l.id, actorUserId: owner.id }),
      ]);
      expect(Number(checkout.ok) + Number(mark.ok)).toBe(1);
    }
  });
});

describe("delivery address", () => {
  it("payment can't start without an address", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const buyer = await createUser(db);
    const r = await createCheckout(db, { buyerId: buyer.id, listingIds: [l.id] });
    if (!r.ok) throw new Error();
    expect(await startPayment(db, { orderId: r.orderId, buyerId: buyer.id, provider: "cashfree", providerOrderId: "x" })).toEqual({
      ok: false,
      reason: "ADDRESS_REQUIRED",
    });
  });

  it("the address is frozen once payment starts, and only the buyer can set it", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const [buyer, other] = [await createUser(db), await createUser(db)];
    const r = await createCheckout(db, { buyerId: buyer.id, listingIds: [l.id] });
    if (!r.ok) throw new Error();

    expect(await setOrderShippingAddress(db, { orderId: r.orderId, buyerId: other.id, address: ADDRESS })).toEqual({ ok: false, reason: "NOT_FOUND" });
    await pay(r.orderId, buyer.id);
    expect(await setOrderShippingAddress(db, { orderId: r.orderId, buyerId: buyer.id, address: { ...ADDRESS, city: "Mumbai" } })).toEqual({
      ok: false,
      reason: "PAYMENT_IN_PROGRESS",
    });
    const [o] = await db.select().from(orders).where(eq(orders.id, r.orderId));
    expect(o!.shippingAddress?.city).toBe("Pune");
  });
});
