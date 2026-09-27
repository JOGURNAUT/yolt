import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { claims, orderItems, orders, refunds, reviews } from "@yolt/db";
import {
  applyTrackingEvent,
  claimWindow,
  closeDeliveredOrders,
  createReview,
  getReviewableItems,
  openClaim,
  recordShipmentBooked,
  replyToReview,
  respondToClaim,
  withdrawClaim,
} from "../src";
import { createSeller, deliveredOrder, paidOrder, testDb, truncateAll } from "./fixtures";

const { db, close } = testDb(20);
afterAll(close);
beforeEach(() => truncateAll(db));

const PHOTO = ["https://media.test/flaw.webp"];
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

describe("buyer protection claims", () => {
  it("not-as-described within 48 h → seller accepts → full refund", async () => {
    const p = await deliveredOrder(db);
    const c = await openClaim(db, { buyerId: p.buyer.id, orderId: p.orderId, reason: "NOT_AS_DESCRIBED", description: "Big stain not shown in photos", photoUrls: PHOTO });
    expect(c.ok).toBe(true);
    const r = await respondToClaim(db, { sellerId: p.seller.id, claimId: c.ok ? c.claimId : "", actorUserId: p.owner.id, action: "ACCEPT", response: "Sorry, refunded" });
    expect(r).toMatchObject({ ok: true, refundId: expect.any(String) });
    const [refund] = await db.select().from(refunds);
    const [o] = await db.select().from(orders).where(eq(orders.id, p.orderId));
    expect(refund!.amountPaise).toBe(o!.totalPaise);
    const [claim] = await db.select().from(claims);
    expect(claim!.status).toBe("REFUNDED");
  });

  it("requires photos for described, damaged and wrong-item claims", async () => {
    const p = await deliveredOrder(db);
    for (const reason of ["NOT_AS_DESCRIBED", "DAMAGED", "WRONG_ITEM"] as const) {
      expect(await openClaim(db, { buyerId: p.buyer.id, orderId: p.orderId, reason, description: "x", photoUrls: [] })).toEqual({
        ok: false,
        reason: "EVIDENCE_REQUIRED",
      });
    }
  });

  it("closes after the 48 h window", async () => {
    const p = await deliveredOrder(db, { deliveredAt: hoursAgo(49) });
    expect(await openClaim(db, { buyerId: p.buyer.id, orderId: p.orderId, reason: "DAMAGED", description: "Torn", photoUrls: PHOTO })).toEqual({
      ok: false,
      reason: "WINDOW_CLOSED",
    });
  });

  it("not received: allowed once a shipped parcel is 10 days late", async () => {
    const p = await paidOrder(db);
    await recordShipmentBooked(db, { sellerId: p.seller.id, orderId: p.orderId, actorUserId: p.owner.id, booking: { provider: "dev", providerShipmentId: "s1", awb: "LATE1", courierName: "Dev" } });
    await applyTrackingEvent(db, { provider: "dev", awb: "LATE1", providerEventId: "pu", status: "PICKED_UP", occurredAt: hoursAgo(24 * 11) });
    expect(await openClaim(db, { buyerId: p.buyer.id, orderId: p.orderId, reason: "DAMAGED", description: "x", photoUrls: PHOTO })).toEqual({
      ok: false,
      reason: "NOT_ELIGIBLE",
    });
    const r = await openClaim(db, { buyerId: p.buyer.id, orderId: p.orderId, reason: "NOT_RECEIVED", description: "Nothing yet", photoUrls: [] });
    expect(r.ok).toBe(true);
  });

  it("not received too early is refused", async () => {
    const w = claimWindow({ status: "SHIPPED", shippedAt: hoursAgo(24), deliveredAt: null }, "NOT_RECEIVED");
    expect(w).toEqual({ open: false, reason: "TOO_EARLY" });
  });

  it("one claim per order, even when submitted twice at once", async () => {
    const p = await deliveredOrder(db);
    const results = await Promise.all(
      [1, 2, 3].map(() => openClaim(db, { buyerId: p.buyer.id, orderId: p.orderId, reason: "DAMAGED", description: "Torn", photoUrls: PHOTO })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("dispute escalates; the order stays open past 48 h while a claim is unresolved", async () => {
    const p = await deliveredOrder(db, { deliveredAt: hoursAgo(47) });
    const c = await openClaim(db, { buyerId: p.buyer.id, orderId: p.orderId, reason: "WRONG_ITEM", description: "Got a different jacket", photoUrls: PHOTO });
    if (!c.ok) throw new Error(c.reason);
    await respondToClaim(db, { sellerId: p.seller.id, claimId: c.claimId, actorUserId: p.owner.id, action: "DISPUTE", response: "It's the listed jacket" });
    expect((await db.select().from(claims))[0]!.status).toBe("ESCALATED");
    expect(await db.select().from(refunds)).toHaveLength(0);

    expect(await closeDeliveredOrders(db, { now: new Date(Date.now() + 5 * 3_600_000) })).toEqual({ closed: 0 });
    await withdrawClaim(db, { buyerId: p.buyer.id, claimId: c.claimId });
    expect(await closeDeliveredOrders(db, { now: new Date(Date.now() + 5 * 3_600_000) })).toEqual({ closed: 1 });
  });

  it("only the order's buyer can claim and only its seller can respond, once", async () => {
    const p = await deliveredOrder(db);
    const q = await paidOrder(db);
    expect((await openClaim(db, { buyerId: q.buyer.id, orderId: p.orderId, reason: "DAMAGED", description: "x", photoUrls: PHOTO })).ok).toBe(false);
    const c = await openClaim(db, { buyerId: p.buyer.id, orderId: p.orderId, reason: "DAMAGED", description: "Torn", photoUrls: PHOTO });
    if (!c.ok) throw new Error();
    const { seller: other, owner } = await createSeller(db);
    expect(await respondToClaim(db, { sellerId: other.id, claimId: c.claimId, actorUserId: owner.id, action: "ACCEPT", response: "" })).toEqual({ ok: false, reason: "NOT_FOUND" });
    await respondToClaim(db, { sellerId: p.seller.id, claimId: c.claimId, actorUserId: p.owner.id, action: "ACCEPT", response: "ok" });
    expect(await respondToClaim(db, { sellerId: p.seller.id, claimId: c.claimId, actorUserId: p.owner.id, action: "ACCEPT", response: "again" })).toEqual({
      ok: false,
      reason: "NOT_OPEN",
    });
    expect(await db.select().from(refunds)).toHaveLength(1);
  });
});

describe("verified reviews", () => {
  it("only after delivery, once per item, by the buyer", async () => {
    const paid = await paidOrder(db);
    const [paidItem] = await db.select().from(orderItems).where(eq(orderItems.orderId, paid.orderId));
    expect(await createReview(db, { buyerId: paid.buyer.id, orderItemId: paidItem!.id, rating: 5 })).toEqual({ ok: false, reason: "NOT_DELIVERED" });

    const p = await deliveredOrder(db);
    const [item] = await getReviewableItems(db, { buyerId: p.buyer.id, orderId: p.orderId });
    expect(await createReview(db, { buyerId: paid.buyer.id, orderItemId: item!.id, rating: 5 })).toEqual({ ok: false, reason: "NOT_FOUND" });
    const r = await createReview(db, { buyerId: p.buyer.id, orderItemId: item!.id, rating: 5, accuracyRating: 5, body: " Exactly as described! " });
    expect(r.ok).toBe(true);
    expect(await createReview(db, { buyerId: p.buyer.id, orderItemId: item!.id, rating: 1 })).toEqual({ ok: false, reason: "ALREADY_REVIEWED" });
    expect(await getReviewableItems(db, { buyerId: p.buyer.id, orderId: p.orderId })).toHaveLength(0);
    const [saved] = await db.select().from(reviews);
    expect(saved!.body).toBe("Exactly as described!");
    expect(saved!.sellerId).toBe(p.seller.id);
  });

  it("rejects bad ratings and too many photos", async () => {
    const p = await deliveredOrder(db);
    const [item] = await getReviewableItems(db, { buyerId: p.buyer.id, orderId: p.orderId });
    for (const rating of [0, 6, 3.5]) expect((await createReview(db, { buyerId: p.buyer.id, orderItemId: item!.id, rating })).ok).toBe(false);
    expect((await createReview(db, { buyerId: p.buyer.id, orderItemId: item!.id, rating: 5, photoUrls: ["a", "b", "c", "d"] })).ok).toBe(false);
  });

  it("the seller can reply once, only on their own store's reviews", async () => {
    const p = await deliveredOrder(db);
    const [item] = await getReviewableItems(db, { buyerId: p.buyer.id, orderId: p.orderId });
    const r = await createReview(db, { buyerId: p.buyer.id, orderItemId: item!.id, rating: 4 });
    if (!r.ok) throw new Error();
    const { seller: other } = await createSeller(db);
    expect((await replyToReview(db, { sellerId: other.id, reviewId: r.reviewId, reply: "hi" })).ok).toBe(false);
    expect((await replyToReview(db, { sellerId: p.seller.id, reviewId: r.reviewId, reply: "Thank you!" })).ok).toBe(true);
    expect((await replyToReview(db, { sellerId: p.seller.id, reviewId: r.reviewId, reply: "Edited" })).ok).toBe(false);
  });
});
