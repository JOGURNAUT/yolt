import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { listings, orderItems, orders, refunds, shipmentEvents, shipments } from "@yolt/db";
import {
  applyTrackingEvent,
  canBookShipment,
  cancelOrderBySeller,
  cancelOrderForLateDispatch,
  closeDeliveredOrders,
  createCheckout,
  getBuyerOrder,
  getBuyerOrders,
  getSellerOrder,
  getSellerOrderCounts,
  getSellerOrders,
  recordShipmentBooked,
  type ShipmentStatus,
} from "../src";
import { createSeller, paidOrder, testDb, truncateAll } from "./fixtures";

const { db, close } = testDb(20);
afterAll(close);
beforeEach(() => truncateAll(db));

const booking = (awb = "AWB123") => ({
  provider: "dev",
  providerShipmentId: `ship_${awb}`,
  awb,
  courierName: "Delhivery",
  trackingUrl: `https://track.test/${awb}`,
  labelUrl: `https://label.test/${awb}`,
});

const orderOf = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0]!;
const track = (awb: string, status: ShipmentStatus, id: string, at = new Date()) =>
  applyTrackingEvent(db, { provider: "dev", awb, providerEventId: id, status, occurredAt: at });

async function booked() {
  const p = await paidOrder(db);
  const r = await recordShipmentBooked(db, { sellerId: p.seller.id, orderId: p.orderId, actorUserId: p.owner.id, booking: booking() });
  if (!r.ok) throw new Error(r.reason);
  return p;
}

describe("booking pickup", () => {
  it("marks a paid order packed and records the booking in its timeline", async () => {
    const p = await booked();
    const o = await orderOf(p.orderId);
    expect(o.status).toBe("PACKED");
    expect(o.packedAt).not.toBeNull();
    const events = await db.select().from(shipmentEvents);
    expect(events.map((e) => e.status)).toEqual(["BOOKED"]);
  });

  it("can't be booked twice, even concurrently", async () => {
    const p = await paidOrder(db);
    const results = await Promise.all(
      ["A1", "A2", "A3"].map((awb) =>
        recordShipmentBooked(db, { sellerId: p.seller.id, orderId: p.orderId, actorUserId: p.owner.id, booking: booking(awb) }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.select().from(shipments)).toHaveLength(1);
    expect(await canBookShipment(db, { sellerId: p.seller.id, orderId: p.orderId })).toEqual({ ok: false, reason: "ALREADY_BOOKED" });
  });

  it("only the order's seller can book, and only for paid orders", async () => {
    const p = await paidOrder(db);
    const { seller: other, owner: otherOwner } = await createSeller(db);
    expect(await recordShipmentBooked(db, { sellerId: other.id, orderId: p.orderId, actorUserId: otherOwner.id, booking: booking() })).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });

    // An unpaid checkout can't be shipped.
    const { seller } = await createSeller(db);
    const { createListing, createUser } = await import("./fixtures");
    const l = await createListing(db, seller.id);
    const buyer = await createUser(db);
    const c = await createCheckout(db, { buyerId: buyer.id, listingIds: [l.id] });
    expect(await canBookShipment(db, { sellerId: seller.id, orderId: c.ok ? c.orderId : "" })).toEqual({ ok: false, reason: "NOT_CONFIRMED" });
  });
});

describe("tracking updates", () => {
  it("picked up → shipped; delivered → delivered", async () => {
    const p = await booked();
    expect(await track("AWB123", "PICKED_UP", "e1")).toMatchObject({ result: "APPLIED" });
    expect((await orderOf(p.orderId)).status).toBe("SHIPPED");
    await track("AWB123", "IN_TRANSIT", "e2");
    await track("AWB123", "DELIVERED", "e3");
    const o = await orderOf(p.orderId);
    expect(o.status).toBe("DELIVERED");
    expect(o.deliveredAt).not.toBeNull();
  });

  it("duplicates are ignored and late updates never move backwards", async () => {
    const p = await booked();
    await track("AWB123", "DELIVERED", "e1");
    expect(await track("AWB123", "DELIVERED", "e1")).toMatchObject({ result: "DUPLICATE" });
    expect(await track("AWB123", "IN_TRANSIT", "e0-late")).toMatchObject({ result: "RECORDED_NOT_APPLIED" });
    const [s] = await db.select().from(shipments);
    expect(s!.status).toBe("DELIVERED");
    expect((await orderOf(p.orderId)).status).toBe("DELIVERED");
    // Both events are in the history.
    expect((await db.select().from(shipmentEvents)).length).toBe(3);
  });

  it("delivered without a pickup scan still records a ship date", async () => {
    const p = await booked();
    await track("AWB123", "DELIVERED", "e1");
    const o = await orderOf(p.orderId);
    expect(o.shippedAt).not.toBeNull();
  });

  it("unknown AWBs are reported, not applied", async () => {
    expect(await track("NOPE", "DELIVERED", "x")).toEqual({ result: "UNKNOWN_SHIPMENT" });
  });

  it("concurrent duplicate webhooks apply once", async () => {
    await booked();
    const results = await Promise.all([track("AWB123", "PICKED_UP", "same"), track("AWB123", "PICKED_UP", "same"), track("AWB123", "PICKED_UP", "same")]);
    expect(results.filter((r) => r.result === "APPLIED")).toHaveLength(1);
  });
});

describe("cancellation", () => {
  it("seller cancels before pickup: full refund, shipment cancelled, item off sale but relistable", async () => {
    const p = await booked();
    const r = await cancelOrderBySeller(db, { sellerId: p.seller.id, orderId: p.orderId, actorUserId: p.owner.id, reason: "Found a stain" });
    expect(r).toMatchObject({ ok: true, shipmentToCancel: { provider: "dev" } });

    const o = await orderOf(p.orderId);
    expect(o.status).toBe("CANCELLED_BY_SELLER");
    expect(o.cancelReason).toBe("Found a stain");
    const [refund] = await db.select().from(refunds);
    expect(refund!.amountPaise).toBe(o.totalPaise);
    const [l] = await db.select().from(listings).where(eq(listings.id, p.listing.id));
    expect(l!.status).toBe("WITHDRAWN");
    const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, p.orderId));
    expect(item!.allocated).toBe(false);
  });

  it("seller can't cancel once the courier has it", async () => {
    const p = await booked();
    await track("AWB123", "PICKED_UP", "e1");
    expect(await cancelOrderBySeller(db, { sellerId: p.seller.id, orderId: p.orderId, actorUserId: p.owner.id, reason: "x" })).toEqual({
      ok: false,
      reason: "NOT_CANCELLABLE",
    });
  });

  it("buyer can cancel only after the dispatch deadline plus grace", async () => {
    const t0 = new Date();
    const p = await paidOrder(db, { now: t0 });
    const o = await orderOf(p.orderId);
    const deadline = o.dispatchBy!.getTime();

    expect(await cancelOrderForLateDispatch(db, { buyerId: p.buyer.id, orderId: p.orderId, now: new Date(deadline + 3_600_000) })).toEqual({
      ok: false,
      reason: "TOO_EARLY",
    });
    const r = await cancelOrderForLateDispatch(db, { buyerId: p.buyer.id, orderId: p.orderId, now: new Date(deadline + 49 * 3_600_000) });
    expect(r.ok).toBe(true);
    expect((await orderOf(p.orderId)).status).toBe("CANCELLED_BY_BUYER");
    expect(await db.select().from(refunds)).toHaveLength(1);
  });

  it("another buyer can't cancel someone's order", async () => {
    const p = await paidOrder(db);
    const q = await paidOrder(db);
    expect(await cancelOrderForLateDispatch(db, { buyerId: q.buyer.id, orderId: p.orderId, now: new Date(Date.now() + 30 * 86_400_000) })).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
  });
});

describe("closing and reads", () => {
  it("closes delivered orders after the 48 h return window", async () => {
    const p = await booked();
    const deliveredAt = new Date();
    await track("AWB123", "DELIVERED", "e1", deliveredAt);
    expect(await closeDeliveredOrders(db, { now: new Date(deliveredAt.getTime() + 47 * 3_600_000) })).toEqual({ closed: 0 });
    expect(await closeDeliveredOrders(db, { now: new Date(deliveredAt.getTime() + 49 * 3_600_000) })).toEqual({ closed: 1 });
    expect((await orderOf(p.orderId)).status).toBe("CLOSED");
  });

  it("seller and buyer each see only their own orders", async () => {
    const p = await booked();
    const q = await paidOrder(db);
    expect(await getSellerOrder(db, { sellerId: q.seller.id, orderId: p.orderId })).toBeNull();
    expect(await getBuyerOrder(db, { buyerId: q.buyer.id, orderId: p.orderId })).toBeNull();

    const detail = await getSellerOrder(db, { sellerId: p.seller.id, orderId: p.orderId });
    expect(detail!.shipment!.awb).toBe("AWB123");
    expect(detail!.order.shippingAddress?.pincode).toBe("411001");
    expect((await getBuyerOrders(db, p.buyer.id)).map((o) => o.id)).toEqual([p.orderId]);
    expect(await getSellerOrderCounts(db, p.seller.id)).toMatchObject({ "to-ship": 0, packed: 1 });

    // Summary subqueries must resolve against the right order (regression: they came back null
    // when the outer query had no join).
    const [summary] = await getSellerOrders(db, { sellerId: p.seller.id, tab: "packed" });
    expect(summary!.firstItem?.title).toBe(p.listing.title);
    expect(summary!.itemCount).toBe(1);
    const [buyerSummary] = await getBuyerOrders(db, p.buyer.id);
    expect(buyerSummary!.firstItem?.title).toBe(p.listing.title);
  });
});
