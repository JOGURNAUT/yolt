import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import {
  auditEvents,
  listings,
  orderItems,
  orders,
  outboxEvents,
  paymentAttempts,
  refunds,
  sellers,
  shipmentEvents,
  shipments,
  type Db,
  type Tx,
} from "@yolt/db";

/**
 * Order fulfilment after payment (docs/user-flows.md S-F7, B-F8):
 * CONFIRMED → PACKED (pickup booked) → SHIPPED (picked up) → DELIVERED → CLOSED (return window over).
 * Cancellation branches: seller before pickup; buyer if the seller misses the dispatch deadline.
 */

/** Size/not-as-described return requests must be raised within this window (decision D6). */
export const RETURN_WINDOW_HOURS = 48;
/** Extra time after the dispatch deadline before the buyer may cancel for a full refund. */
export const DISPATCH_GRACE_HOURS = 48;

export type ShipmentStatus = (typeof shipments.$inferSelect)["status"];

/** Forward-only progression. RTO and CANCELLED are terminal side branches. */
const RANK: Record<ShipmentStatus, number> = {
  BOOKED: 0,
  PICKED_UP: 1,
  IN_TRANSIT: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
  RTO: 5,
  CANCELLED: 5,
};
const TERMINAL = new Set<ShipmentStatus>(["DELIVERED", "RTO", "CANCELLED"]);

const hours = (n: number) => n * 3_600_000;

// ---------------------------------------------------------------------------
// Book pickup
// ---------------------------------------------------------------------------

export type ShipmentBooking = {
  provider: string;
  providerShipmentId: string;
  awb: string;
  courierName: string;
  trackingUrl?: string | null;
  labelUrl?: string | null;
  pickupScheduledFor?: Date | null;
};

export type ShipmentRecordResult = { ok: true; shipmentId: string } | { ok: false; reason: "NOT_FOUND" | "NOT_CONFIRMED" | "ALREADY_BOOKED" };

/** Can this seller book a pickup for this order right now? A cheap check before calling the courier. */
export async function canBookShipment(db: Db, input: { sellerId: string; orderId: string }) {
  const [row] = await db
    .select({ status: orders.status, shipmentId: shipments.id })
    .from(orders)
    .leftJoin(shipments, eq(shipments.orderId, orders.id))
    .where(and(eq(orders.id, input.orderId), eq(orders.sellerId, input.sellerId)));
  if (!row) return { ok: false as const, reason: "NOT_FOUND" as const };
  if (row.shipmentId) return { ok: false as const, reason: "ALREADY_BOOKED" as const };
  if (row.status !== "CONFIRMED") return { ok: false as const, reason: "NOT_CONFIRMED" as const };
  return { ok: true as const };
}

/** Records a courier booking and marks the order packed. The unique order_id on shipments prevents double booking. */
export async function recordShipmentBooked(
  db: Db,
  input: { sellerId: string; orderId: string; actorUserId: string; booking: ShipmentBooking; now?: Date },
): Promise<ShipmentRecordResult> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.sellerId, input.sellerId)))
      .for("update");
    if (!order) return { ok: false, reason: "NOT_FOUND" } as const;
    const [existing] = await tx.select({ id: shipments.id }).from(shipments).where(eq(shipments.orderId, order.id));
    if (existing) return { ok: false, reason: "ALREADY_BOOKED" } as const;
    if (order.status !== "CONFIRMED") return { ok: false, reason: "NOT_CONFIRMED" } as const;

    const b = input.booking;
    const [shipment] = await tx
      .insert(shipments)
      .values({
        orderId: order.id,
        provider: b.provider,
        providerShipmentId: b.providerShipmentId,
        awb: b.awb,
        courierName: b.courierName,
        trackingUrl: b.trackingUrl ?? null,
        labelUrl: b.labelUrl ?? null,
        pickupScheduledFor: b.pickupScheduledFor ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: shipments.id });
    await tx.insert(shipmentEvents).values({
      shipmentId: shipment!.id,
      providerEventId: `booked:${b.awb}`,
      status: "BOOKED",
      description: `Pickup booked with ${b.courierName}`,
      occurredAt: now,
      receivedAt: now,
    });
    await tx.update(orders).set({ status: "PACKED", packedAt: now, updatedAt: now }).where(eq(orders.id, order.id));
    await tx.insert(outboxEvents).values({ type: "order.packed", payload: { orderId: order.id } });
    await tx.insert(auditEvents).values({
      actorId: input.actorUserId,
      actorRole: "seller",
      action: "order.pickup_booked",
      entity: "order",
      entityId: order.id,
      after: { awb: b.awb, courier: b.courierName },
    });
    return { ok: true, shipmentId: shipment!.id } as const;
  });
}

// ---------------------------------------------------------------------------
// Tracking updates (verified courier webhooks) — idempotent, forward-only
// ---------------------------------------------------------------------------

export type TrackingEvent = {
  provider: string;
  awb: string;
  providerEventId: string;
  status: ShipmentStatus;
  description?: string | null;
  location?: string | null;
  occurredAt: Date;
};

export type TrackingResult =
  | { result: "APPLIED"; orderId: string; shipmentStatus: ShipmentStatus }
  | { result: "DUPLICATE" | "RECORDED_NOT_APPLIED"; orderId: string }
  | { result: "UNKNOWN_SHIPMENT" };

export async function applyTrackingEvent(db: Db, e: TrackingEvent, now = new Date()): Promise<TrackingResult> {
  return db.transaction(async (tx) => {
    const [shipment] = await tx
      .select()
      .from(shipments)
      .where(and(eq(shipments.provider, e.provider), eq(shipments.awb, e.awb)))
      .for("update");
    if (!shipment) return { result: "UNKNOWN_SHIPMENT" } as const;

    const inserted = await tx
      .insert(shipmentEvents)
      .values({
        shipmentId: shipment.id,
        providerEventId: e.providerEventId,
        status: e.status,
        description: e.description ?? null,
        location: e.location ?? null,
        occurredAt: e.occurredAt,
        receivedAt: now,
      })
      .onConflictDoNothing({ target: [shipmentEvents.shipmentId, shipmentEvents.providerEventId] })
      .returning({ id: shipmentEvents.id });
    if (inserted.length === 0) return { result: "DUPLICATE", orderId: shipment.orderId } as const;

    // Late or out-of-order updates are kept in the history but never move the shipment backwards.
    if (TERMINAL.has(shipment.status) || RANK[e.status] <= RANK[shipment.status]) {
      return { result: "RECORDED_NOT_APPLIED", orderId: shipment.orderId } as const;
    }

    await tx.update(shipments).set({ status: e.status, updatedAt: now }).where(eq(shipments.id, shipment.id));

    const [order] = await tx.select().from(orders).where(eq(orders.id, shipment.orderId)).for("update");
    if (!order) throw new Error(`shipment ${shipment.id} has no order`);

    if (["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(e.status) && order.status === "PACKED") {
      await tx.update(orders).set({ status: "SHIPPED", shippedAt: e.occurredAt, updatedAt: now }).where(eq(orders.id, order.id));
      await tx.insert(outboxEvents).values({ type: "order.shipped", payload: { orderId: order.id } });
    } else if (e.status === "DELIVERED" && (order.status === "PACKED" || order.status === "SHIPPED")) {
      await tx
        .update(orders)
        .set({ status: "DELIVERED", shippedAt: order.shippedAt ?? e.occurredAt, deliveredAt: e.occurredAt, updatedAt: now })
        .where(eq(orders.id, order.id));
      await tx.insert(outboxEvents).values({ type: "order.delivered", payload: { orderId: order.id } });
    } else if (e.status === "RTO") {
      // Couldn't be delivered and is heading back. Needs a person: refund, re-attempt or relist.
      await tx.insert(outboxEvents).values({ type: "shipment.rto", payload: { orderId: order.id, shipmentId: shipment.id } });
      await tx.insert(auditEvents).values({
        actorRole: "system",
        action: "shipment.rto",
        entity: "order",
        entityId: order.id,
        after: { awb: shipment.awb },
      });
    }
    return { result: "APPLIED", orderId: order.id, shipmentStatus: e.status } as const;
  });
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

type CancelOutcome =
  | { ok: true; refundId: string | null; shipmentToCancel: { provider: string; providerShipmentId: string } | null }
  | { ok: false; reason: "NOT_FOUND" | "NOT_CANCELLABLE" | "TOO_EARLY" };

/**
 * Shared cancel path: refund in full, cancel an unpicked shipment, and take the item off sale
 * (the seller couldn't or didn't send it, so it shouldn't go straight back on sale).
 * Allocation is released so the item can be relisted and sold again later.
 */
async function cancelPaidOrder(
  tx: Tx,
  order: typeof orders.$inferSelect,
  input: { status: "CANCELLED_BY_SELLER" | "CANCELLED_BY_BUYER"; reason: string; actorId: string; actorRole: string; now: Date },
): Promise<CancelOutcome> {
  const [shipment] = await tx.select().from(shipments).where(eq(shipments.orderId, order.id)).for("update");
  if (shipment && shipment.status !== "BOOKED") return { ok: false, reason: "NOT_CANCELLABLE" };
  if (shipment) {
    await tx.update(shipments).set({ status: "CANCELLED", updatedAt: input.now }).where(eq(shipments.id, shipment.id));
  }

  await tx
    .update(orders)
    .set({ status: input.status, cancelledAt: input.now, cancelReason: input.reason, updatedAt: input.now })
    .where(eq(orders.id, order.id));

  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  await tx.update(orderItems).set({ allocated: false }).where(eq(orderItems.orderId, order.id));
  await tx
    .update(listings)
    .set({ status: "WITHDRAWN", updatedAt: input.now })
    .where(and(inArray(listings.id, items.map((i) => i.listingId)), eq(listings.status, "SOLD")));

  const [paid] = await tx
    .select()
    .from(paymentAttempts)
    .where(and(eq(paymentAttempts.orderId, order.id), eq(paymentAttempts.status, "SUCCEEDED")))
    .orderBy(desc(paymentAttempts.createdAt))
    .limit(1);
  let refundId: string | null = null;
  if (paid) {
    const [refund] = await tx
      .insert(refunds)
      .values({ orderId: order.id, paymentAttemptId: paid.id, amountPaise: paid.amountPaise, reason: input.status })
      .returning({ id: refunds.id });
    refundId = refund!.id;
    await tx.insert(outboxEvents).values({ type: "refund.requested", payload: { refundId, orderId: order.id, reason: input.status } });
  }
  await tx.insert(auditEvents).values({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.status === "CANCELLED_BY_SELLER" ? "order.cancelled_by_seller" : "order.cancelled_late_dispatch",
    entity: "order",
    entityId: order.id,
    reason: input.reason,
  });
  return {
    ok: true,
    refundId,
    shipmentToCancel: shipment ? { provider: shipment.provider, providerShipmentId: shipment.providerShipmentId } : null,
  };
}

/** Seller can't send the item (damaged, lost, sold elsewhere by mistake). Only before pickup. */
export async function cancelOrderBySeller(
  db: Db,
  input: { sellerId: string; orderId: string; actorUserId: string; reason: string; now?: Date },
): Promise<CancelOutcome> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.sellerId, input.sellerId)))
      .for("update");
    if (!order) return { ok: false, reason: "NOT_FOUND" } as const;
    if (order.status !== "CONFIRMED" && order.status !== "PACKED") return { ok: false, reason: "NOT_CANCELLABLE" } as const;
    return cancelPaidOrder(tx, order, {
      status: "CANCELLED_BY_SELLER",
      reason: input.reason,
      actorId: input.actorUserId,
      actorRole: "seller",
      now,
    });
  });
}

/** The seller missed the dispatch deadline by more than the grace period: the buyer may cancel for a full refund. */
export async function cancelOrderForLateDispatch(
  db: Db,
  input: { buyerId: string; orderId: string; now?: Date },
): Promise<CancelOutcome> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.buyerId, input.buyerId)))
      .for("update");
    if (!order) return { ok: false, reason: "NOT_FOUND" } as const;
    if (order.status !== "CONFIRMED" && order.status !== "PACKED") return { ok: false, reason: "NOT_CANCELLABLE" } as const;
    if (!order.dispatchBy || now.getTime() < order.dispatchBy.getTime() + hours(DISPATCH_GRACE_HOURS)) {
      return { ok: false, reason: "TOO_EARLY" } as const;
    }
    return cancelPaidOrder(tx, order, {
      status: "CANCELLED_BY_BUYER",
      reason: "Seller did not dispatch in time",
      actorId: input.buyerId,
      actorRole: "buyer",
      now,
    });
  });
}

/** When the buyer may cancel for late dispatch, or null if that doesn't apply. */
export function lateCancelAvailableAt(order: { status: string; dispatchBy: Date | null }) {
  if ((order.status !== "CONFIRMED" && order.status !== "PACKED") || !order.dispatchBy) return null;
  return new Date(order.dispatchBy.getTime() + hours(DISPATCH_GRACE_HOURS));
}

// ---------------------------------------------------------------------------
// Closing (run hourly by cron)
// ---------------------------------------------------------------------------

export async function closeDeliveredOrders(db: Db, opts: { now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const closed = await db
    .update(orders)
    .set({ status: "CLOSED", closedAt: now, updatedAt: now })
    .where(and(eq(orders.status, "DELIVERED"), lte(orders.deliveredAt, new Date(now.getTime() - hours(RETURN_WINDOW_HOURS)))))
    .returning({ id: orders.id });
  if (closed.length) {
    await db.insert(outboxEvents).values(closed.map((o) => ({ type: "order.closed", payload: { orderId: o.id } })));
  }
  return { closed: closed.length };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const SELLER_ORDER_TABS = {
  "to-ship": ["CONFIRMED"],
  packed: ["PACKED"],
  shipped: ["SHIPPED"],
  delivered: ["DELIVERED", "CLOSED"],
  cancelled: ["CANCELLED_BY_SELLER", "CANCELLED_BY_BUYER"],
} as const satisfies Record<string, (typeof orders.$inferSelect)["status"][]>;
export type SellerOrderTab = keyof typeof SELLER_ORDER_TABS;

const summaryColumns = {
  id: orders.id,
  reference: orders.reference,
  status: orders.status,
  source: orders.source,
  totalPaise: orders.totalPaise,
  dispatchBy: orders.dispatchBy,
  confirmedAt: orders.confirmedAt,
  deliveredAt: orders.deliveredAt,
  shippingAddress: orders.shippingAddress,
  /** Past the dispatch deadline and not yet packed, by the database clock. */
  overdue: sql<boolean>`(${orders.status} = 'CONFIRMED' AND ${orders.dispatchBy} < now())`,
  // Correlated subqueries name tables explicitly: without a join Drizzle renders columns
  // unqualified, and "id" would bind to order_items instead of orders.
  itemCount: sql<number>`(SELECT count(*)::int FROM ${orderItems} oi WHERE oi.order_id = ${orders}.id)`,
  firstItem: sql<{ title: string; tagSize: string | null; photoUrl: string | null; category: string }>`(
    SELECT oi.snapshot FROM ${orderItems} oi WHERE oi.order_id = ${orders}.id ORDER BY oi.id LIMIT 1)`,
};

export async function getSellerOrders(db: Db, input: { sellerId: string; tab: SellerOrderTab }) {
  return db
    .select(summaryColumns)
    .from(orders)
    .where(and(eq(orders.sellerId, input.sellerId), inArray(orders.status, [...SELLER_ORDER_TABS[input.tab]])))
    .orderBy(input.tab === "to-ship" ? asc(orders.dispatchBy) : desc(orders.updatedAt))
    .limit(100);
}

export async function getSellerOrderCounts(db: Db, sellerId: string) {
  const rows = await db
    .select({ status: orders.status, n: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.sellerId, sellerId))
    .groupBy(orders.status);
  const by = new Map(rows.map((r) => [r.status, r.n]));
  return Object.fromEntries(
    Object.entries(SELLER_ORDER_TABS).map(([tab, statuses]) => [tab, statuses.reduce((t, s) => t + (by.get(s) ?? 0), 0)]),
  ) as Record<SellerOrderTab, number>;
}

async function orderDetail(db: Db, order: typeof orders.$inferSelect) {
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.id));
  const [shipment] = await db.select().from(shipments).where(eq(shipments.orderId, order.id));
  const events = shipment
    ? await db.select().from(shipmentEvents).where(eq(shipmentEvents.shipmentId, shipment.id)).orderBy(asc(shipmentEvents.occurredAt))
    : [];
  return { order, items, shipment: shipment ?? null, events };
}

/** For the seller: includes the delivery address, which they need to ship. */
export async function getSellerOrder(db: Db, input: { sellerId: string; orderId: string }) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, input.orderId), eq(orders.sellerId, input.sellerId)));
  return order ? orderDetail(db, order) : null;
}

/** Orders the buyer has paid for (checkouts that never completed aren't listed). */
export async function getBuyerOrders(db: Db, buyerId: string) {
  return db
    .select({ ...summaryColumns, sellerName: sellers.displayName })
    .from(orders)
    .innerJoin(sellers, eq(sellers.id, orders.sellerId))
    .where(and(eq(orders.buyerId, buyerId), sql`${orders.confirmedAt} IS NOT NULL`))
    .orderBy(desc(orders.confirmedAt))
    .limit(100);
}

export async function getBuyerOrder(db: Db, input: { buyerId: string; orderId: string }) {
  const [row] = await db
    .select({ order: orders, sellerName: sellers.displayName, sellerHandle: sellers.handle })
    .from(orders)
    .innerJoin(sellers, eq(sellers.id, orders.sellerId))
    .where(and(eq(orders.id, input.orderId), eq(orders.buyerId, input.buyerId)));
  if (!row) return null;
  return { ...(await orderDetail(db, row.order)), sellerName: row.sellerName, sellerHandle: row.sellerHandle };
}
