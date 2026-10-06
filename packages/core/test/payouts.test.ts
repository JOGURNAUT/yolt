import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { claims, orderItems, orders, paymentAttempts, refunds } from "@yolt/db";
import { getPayoutStatement, ORDER_SOURCE_LABELS } from "../src";
import { createListing, createSeller, createUser, testDb, truncateAll } from "./fixtures";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));

type Status = (typeof orders.$inferInsert)["status"];

async function order(
  sellerId: string,
  o: { status: Status; subtotal?: number; shipping?: number; source?: "SELLER_LINK" | "YOLT_DISCOVERY"; confirmedAt?: Date | null; refund?: number; claim?: "OPEN" | "ESCALATED" | "REFUNDED" | "WITHDRAWN" },
) {
  const buyer = await createUser(db);
  const subtotal = o.subtotal ?? 100_000;
  const shipping = o.shipping ?? 7_900;
  const [row] = await db
    .insert(orders)
    .values({
      reference: `YL-${randomUUID().slice(0, 6).toUpperCase()}`,
      buyerId: buyer.id,
      sellerId,
      status: o.status,
      source: o.source ?? "YOLT_DISCOVERY",
      subtotalPaise: subtotal,
      shippingPaise: shipping,
      totalPaise: subtotal + shipping,
      confirmedAt: o.confirmedAt === undefined ? new Date() : o.confirmedAt,
    })
    .returning();
  const listing = await createListing(db, sellerId, { status: "SOLD", soldAt: new Date() });
  await db.insert(orderItems).values({ orderId: row!.id, listingId: listing.id, pricePaise: subtotal, snapshot: { title: "x", category: "tops", brandDeclared: null, tagSize: null, measurements: {}, condition: "GOOD", flaws: null, photoUrl: null } });
  if (o.refund !== undefined) {
    const [attempt] = await db.insert(paymentAttempts).values({ orderId: row!.id, provider: "sandbox", providerOrderId: randomUUID(), amountPaise: subtotal + shipping, status: "SUCCEEDED" }).returning();
    await db.insert(refunds).values({ orderId: row!.id, paymentAttemptId: attempt!.id, amountPaise: o.refund, reason: "test" });
  }
  if (o.claim) {
    await db.insert(claims).values({ orderId: row!.id, buyerId: buyer.id, sellerId, reason: "DAMAGED", description: "Torn seam", status: o.claim });
  }
  return row!;
}

describe("payout balances", () => {
  it("splits paid orders into pending and available by the buyer-protection window", async () => {
    const { seller } = await createSeller(db);
    await order(seller.id, { status: "CONFIRMED", subtotal: 10_000, shipping: 0 });
    await order(seller.id, { status: "PACKED", subtotal: 20_000, shipping: 0 });
    await order(seller.id, { status: "SHIPPED", subtotal: 30_000, shipping: 0 });
    await order(seller.id, { status: "DELIVERED", subtotal: 40_000, shipping: 0 });
    await order(seller.id, { status: "CLOSED", subtotal: 500_000, shipping: 7_900 });

    const s = await getPayoutStatement(db, { sellerId: seller.id });
    expect(s.balances).toEqual({ pendingPaise: 100_000, availablePaise: 507_900, paidOutPaise: 0 });
    expect(s.total).toBe(5);
  });

  it("a closed order with an open or escalated claim stays pending; a resolved claim doesn't hold it", async () => {
    const { seller } = await createSeller(db);
    await order(seller.id, { status: "CLOSED", subtotal: 10_000, shipping: 0, claim: "OPEN" });
    await order(seller.id, { status: "CLOSED", subtotal: 20_000, shipping: 0, claim: "ESCALATED" });
    await order(seller.id, { status: "CLOSED", subtotal: 40_000, shipping: 0, claim: "WITHDRAWN" });
    await order(seller.id, { status: "DELIVERED", subtotal: 80_000, shipping: 0, claim: "OPEN" });

    const { balances } = await getPayoutStatement(db, { sellerId: seller.id });
    expect(balances).toMatchObject({ pendingPaise: 110_000, availablePaise: 40_000 });
  });

  it("never counts unpaid, expired, cancelled or refund-needed orders, or other sellers' orders", async () => {
    const { seller } = await createSeller(db);
    const { seller: other } = await createSeller(db);
    for (const status of ["AWAITING_PAYMENT", "EXPIRED", "CANCELLED_BY_BUYER", "CANCELLED_BY_SELLER", "NEEDS_REFUND"] as const) {
      await order(seller.id, { status });
    }
    await order(seller.id, { status: "CLOSED", confirmedAt: null });
    await order(other.id, { status: "CLOSED" });
    expect(await getPayoutStatement(db, { sellerId: seller.id })).toMatchObject({
      balances: { pendingPaise: 0, availablePaise: 0, paidOutPaise: 0 },
      rows: [],
      total: 0,
    });
  });

  it("subtracts refunds, to a floor of zero for a full refund", async () => {
    const { seller } = await createSeller(db);
    await order(seller.id, { status: "CLOSED", subtotal: 100_000, shipping: 7_900, refund: 30_000 });
    await order(seller.id, { status: "CLOSED", subtotal: 50_000, shipping: 7_900, refund: 57_900 });
    const s = await getPayoutStatement(db, { sellerId: seller.id });
    expect(s.balances.availablePaise).toBe(77_900);
    expect(s.rows.map((r) => [r.refundedPaise, r.netPaise]).sort()).toEqual([[30_000, 77_900], [57_900, 0]].sort());
  });
});

describe("payout rows", () => {
  it("labels the source, shows items and shipping, zero commission, newest first", async () => {
    const { seller } = await createSeller(db);
    const older = await order(seller.id, { status: "CLOSED", source: "SELLER_LINK", confirmedAt: new Date(Date.now() - 5 * 86_400_000) });
    const newer = await order(seller.id, { status: "DELIVERED", source: "YOLT_DISCOVERY", subtotal: 250_000, shipping: 0 });

    const { rows } = await getPayoutStatement(db, { sellerId: seller.id });
    expect(rows.map((r) => r.orderId)).toEqual([newer.id, older.id]);
    expect(rows[0]).toMatchObject({
      reference: newer.reference,
      itemsPaise: 250_000,
      shippingPaise: 0,
      source: "YOLT_DISCOVERY",
      sourceLabel: "Found on YOLT",
      commissionPaise: 0,
      refundedPaise: 0,
      netPaise: 250_000,
      bucket: "PENDING",
    });
    expect(rows[1]).toMatchObject({ sourceLabel: "Your link", bucket: "AVAILABLE", netPaise: 107_900 });
    expect(ORDER_SOURCE_LABELS.SELLER_LINK).toBe("Your link");
  });

  it("paginates, with the total across pages", async () => {
    const { seller } = await createSeller(db);
    for (let i = 0; i < 5; i++) await order(seller.id, { status: "CLOSED", confirmedAt: new Date(Date.now() - i * 3_600_000) });
    const p1 = await getPayoutStatement(db, { sellerId: seller.id, page: 1, pageSize: 2 });
    const p3 = await getPayoutStatement(db, { sellerId: seller.id, page: 3, pageSize: 2 });
    const p4 = await getPayoutStatement(db, { sellerId: seller.id, page: 4, pageSize: 2 });
    expect([p1.rows.length, p3.rows.length, p4.rows.length]).toEqual([2, 1, 0]);
    expect(p1.total).toBe(5);
    // Balances cover every order, not just the page.
    expect(p1.balances.availablePaise).toBe(5 * 107_900);
    expect((await getPayoutStatement(db, { sellerId: seller.id, pageSize: 500 })).pageSize).toBe(50);
  });
});
