import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import {
  asComplete,
  auditEvents,
  bagItems,
  holds,
  listingPhotos,
  listings,
  orderItems,
  orders,
  outboxEvents,
  paymentAttempts,
  paymentEvents,
  refunds,
  sellers,
  users,
  type AddressSnapshot,
  type CompleteListing,
  type Db,
  type FirstTouch,
  type ListingSnapshot,
  type Tx,
} from "@yolt/db";
import { orderSourceFor } from "./attribution";

/**
 * Inventory invariants (see docs/user-flows.md §7):
 * - Every path to buying creates a hold. `listings.current_hold_id` names the hold that owns
 *   the item and is the generation token: a release only succeeds if it names the current hold.
 * - Postgres enforces one ACTIVE hold per listing and one allocated order item per listing.
 * - No transaction stays open while the buyer pays.
 */

export const CHECKOUT_HOLD_SECONDS = 5 * 60;
/** When the buyer starts paying, the hold is extended so a slow UPI approval doesn't lose the item. */
export const PAYMENT_HOLD_SECONDS = 15 * 60;

type Conn = Db | Tx;

class Rollback<T> extends Error {
  constructor(readonly result: T) {
    super("rollback");
  }
}

/** Runs `fn` in a transaction; throwing `new Rollback(x)` rolls back and returns `x`. */
async function transactional<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await db.transaction(fn);
  } catch (err) {
    if (err instanceof Rollback) return err.result as T;
    throw err;
  }
}

function orderReference() {
  // Crockford-style alphabet without look-alike characters.
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = randomBytes(6);
  let out = "YL-";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

const addSeconds = (d: Date, s: number) => new Date(d.getTime() + s * 1000);

// ---------------------------------------------------------------------------
// Checkout: create holds + an order awaiting payment
// ---------------------------------------------------------------------------

export type CreateCheckoutInput = {
  buyerId: string;
  listingIds: string[];
  source?: "CHECKOUT" | "OFFER" | "DROP_CLAIM";
  /** Price the buyer saw. If the server total differs, checkout stops so the buyer can reconfirm. */
  expectedSubtotalPaise?: number;
  /** From the browser cookie; used only when the account has no stored first touch (D16). */
  firstTouch?: FirstTouch | null;
  holdSeconds?: number;
  now?: Date;
};

export type CreateCheckoutResult =
  | { ok: true; orderId: string; reference: string; totalPaise: number; expiresAt: Date }
  | { ok: false; reason: "NOT_FOUND" | "MULTIPLE_SELLERS" | "OWN_LISTING" | "EMPTY" | "SELLER_UNAVAILABLE" }
  | { ok: false; reason: "UNAVAILABLE"; unavailableListingIds: string[] }
  | { ok: false; reason: "PRICE_CHANGED"; subtotalPaise: number };

export async function createCheckout(db: Db, input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
  const now = input.now ?? new Date();
  const ids = [...new Set(input.listingIds)].sort(); // consistent lock order avoids deadlocks
  if (ids.length === 0) return { ok: false, reason: "EMPTY" };

  return transactional(db, async (tx) => {
    const rows = await tx
      .select({ listing: listings, sellerUserId: sellers.userId, seller: sellers })
      .from(listings)
      .innerJoin(sellers, eq(sellers.id, listings.sellerId))
      .where(inArray(listings.id, ids));

    if (rows.length !== ids.length) return { ok: false, reason: "NOT_FOUND" } as const;
    const sellerIds = new Set(rows.map((r) => r.listing.sellerId));
    if (sellerIds.size > 1) return { ok: false, reason: "MULTIPLE_SELLERS" } as const;
    const seller = rows[0]!.seller;
    if (seller.userId === input.buyerId) return { ok: false, reason: "OWN_LISTING" } as const;
    if (seller.status !== "APPROVED") return { ok: false, reason: "SELLER_UNAVAILABLE" } as const;

    // Lazy expiry: free items whose hold already ran out, so buyers never wait on the sweep job.
    const stale = await tx
      .select({ id: holds.id, orderId: holds.orderId })
      .from(holds)
      .where(and(inArray(holds.listingId, ids), eq(holds.status, "ACTIVE"), lte(holds.expiresAt, now)))
      .for("update");
    if (stale.length > 0) await expireHoldRows(tx, stale, now);

    const orderId = randomUUID();
    const expiresAt = addSeconds(now, input.holdSeconds ?? CHECKOUT_HOLD_SECONDS);
    const holdIds = new Map(ids.map((id) => [id, randomUUID()]));

    // Atomic conditional claim: only an AVAILABLE item can be reserved. Concurrent claimers
    // block on the row lock, re-check the WHERE clause after the winner commits, and get 0 rows.
    const unavailable: string[] = [];
    const claimedListings: CompleteListing[] = [];
    for (const listingId of ids) {
      const [claimed] = await tx
        .update(listings)
        .set({ status: "RESERVED", currentHoldId: holdIds.get(listingId)!, updatedAt: now })
        .where(and(eq(listings.id, listingId), eq(listings.status, "AVAILABLE")))
        .returning();
      // Price and details come from the claimed row itself, never an earlier read.
      if (claimed) claimedListings.push(asComplete(claimed));
      else unavailable.push(listingId);
    }
    if (unavailable.length > 0) {
      // Never hold a partial set silently; the buyer decides whether to continue with fewer items.
      throw new Rollback({ ok: false, reason: "UNAVAILABLE", unavailableListingIds: unavailable } as const);
    }

    const subtotal = claimedListings.reduce((sum, l) => sum + l.pricePaise, 0);
    if (input.expectedSubtotalPaise !== undefined && input.expectedSubtotalPaise !== subtotal) {
      throw new Rollback({ ok: false, reason: "PRICE_CHANGED", subtotalPaise: subtotal } as const);
    }
    const freeShipping = seller.freeShippingAbovePaise !== null && subtotal >= seller.freeShippingAbovePaise;
    const shipping = freeShipping ? 0 : seller.shippingFeePaise;
    const total = subtotal + shipping;

    const photos = await tx
      .select({ listingId: listingPhotos.listingId, url: listingPhotos.url })
      .from(listingPhotos)
      .where(and(inArray(listingPhotos.listingId, ids), eq(listingPhotos.position, 0)));
    const coverByListing = new Map(photos.map((p) => [p.listingId, p.url]));

    const [buyer] = await tx.select({ firstTouch: users.firstTouch }).from(users).where(eq(users.id, input.buyerId));
    const source = orderSourceFor(buyer?.firstTouch ?? input.firstTouch, seller.handle, now);

    const reference = orderReference();
    await tx.insert(orders).values({
      id: orderId,
      reference,
      buyerId: input.buyerId,
      sellerId: seller.id,
      source,
      subtotalPaise: subtotal,
      shippingPaise: shipping,
      totalPaise: total,
    });
    await tx.insert(orderItems).values(
      claimedListings.map((l) => ({
        orderId,
        listingId: l.id,
        pricePaise: l.pricePaise,
        snapshot: {
          title: l.title,
          category: l.category,
          brandDeclared: l.brandDeclared,
          tagSize: l.tagSize,
          measurements: l.measurements,
          condition: l.condition,
          flaws: l.flaws,
          photoUrl: coverByListing.get(l.id) ?? null,
        } satisfies ListingSnapshot,
      })),
    );
    await tx.insert(holds).values(
      ids.map((listingId) => ({
        id: holdIds.get(listingId)!,
        listingId,
        buyerId: input.buyerId,
        orderId,
        source: input.source ?? "CHECKOUT",
        expiresAt,
        createdAt: now,
      })),
    );

    return { ok: true, orderId, reference, totalPaise: total, expiresAt } as const;
  });
}

// ---------------------------------------------------------------------------
// Start payment: extend the hold and record a payment attempt
// ---------------------------------------------------------------------------

export type StartPaymentInput = {
  orderId: string;
  buyerId: string;
  provider: string;
  /** The provider's order/session id, created before calling this. */
  providerOrderId: string;
  now?: Date;
};

export type StartPaymentResult =
  | {
      ok: true;
      paymentAttemptId: string;
      providerOrderId: string;
      amountPaise: number;
      holdExpiresAt: Date;
      /** True when an unresolved attempt already existed; reuse it instead of charging again. */
      existing: boolean;
    }
  | { ok: false; reason: "NOT_FOUND" | "NOT_AWAITING_PAYMENT" | "HOLD_EXPIRED" | "ADDRESS_REQUIRED" };

export async function startPayment(db: Db, input: StartPaymentInput): Promise<StartPaymentResult> {
  const now = input.now ?? new Date();
  return transactional(db, async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.buyerId, input.buyerId)))
      .for("update");
    if (!order) return { ok: false, reason: "NOT_FOUND" } as const;
    if (order.status !== "AWAITING_PAYMENT") return { ok: false, reason: "NOT_AWAITING_PAYMENT" } as const;
    // Never take money for an order we can't deliver.
    if (!order.shippingAddress) return { ok: false, reason: "ADDRESS_REQUIRED" } as const;

    const orderHolds = await tx.select().from(holds).where(eq(holds.orderId, order.id)).for("update");
    const allLive = orderHolds.length > 0 && orderHolds.every((h) => h.status === "ACTIVE" && h.expiresAt > now);
    if (!allLive) return { ok: false, reason: "HOLD_EXPIRED" } as const;

    // An unresolved attempt must be reconciled before we let the buyer be charged again.
    const [open] = await tx
      .select()
      .from(paymentAttempts)
      .where(and(eq(paymentAttempts.orderId, order.id), inArray(paymentAttempts.status, ["PENDING", "UNKNOWN"])));
    const holdExpiresAt = addSeconds(now, PAYMENT_HOLD_SECONDS);

    await tx.update(holds).set({ expiresAt: holdExpiresAt }).where(eq(holds.orderId, order.id));
    for (const h of orderHolds) {
      await tx
        .update(listings)
        .set({ status: "PAYMENT_PENDING", updatedAt: now })
        .where(eq(listings.currentHoldId, h.id));
    }

    if (open) {
      return {
        ok: true,
        paymentAttemptId: open.id,
        providerOrderId: open.providerOrderId ?? input.providerOrderId,
        amountPaise: open.amountPaise,
        holdExpiresAt,
        existing: true,
      } as const;
    }
    const [attempt] = await tx
      .insert(paymentAttempts)
      .values({
        orderId: order.id,
        provider: input.provider,
        providerOrderId: input.providerOrderId,
        amountPaise: order.totalPaise,
        currency: order.currency,
        status: "PENDING",
      })
      .returning();
    return {
      ok: true,
      paymentAttemptId: attempt!.id,
      providerOrderId: input.providerOrderId,
      amountPaise: attempt!.amountPaise,
      holdExpiresAt,
      existing: false,
    } as const;
  });
}

// ---------------------------------------------------------------------------
// Delivery address
// ---------------------------------------------------------------------------

export type SetOrderAddressResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "NOT_AWAITING_PAYMENT" | "PAYMENT_IN_PROGRESS" };

/**
 * Copies a delivery address onto the order. Allowed only before payment starts: once the
 * buyer is paying, the address is frozen with the rest of the order.
 * The caller checks serviceability first.
 */
export async function setOrderShippingAddress(
  db: Db,
  input: { orderId: string; buyerId: string; address: AddressSnapshot; now?: Date },
): Promise<SetOrderAddressResult> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.buyerId, input.buyerId)))
      .for("update");
    if (!order) return { ok: false, reason: "NOT_FOUND" } as const;
    if (order.status !== "AWAITING_PAYMENT") return { ok: false, reason: "NOT_AWAITING_PAYMENT" } as const;
    const [open] = await tx
      .select({ id: paymentAttempts.id })
      .from(paymentAttempts)
      .where(and(eq(paymentAttempts.orderId, order.id), inArray(paymentAttempts.status, ["PENDING", "UNKNOWN"])));
    if (open) return { ok: false, reason: "PAYMENT_IN_PROGRESS" } as const;
    await tx.update(orders).set({ shippingAddress: input.address, updatedAt: now }).where(eq(orders.id, order.id));
    return { ok: true } as const;
  });
}

// ---------------------------------------------------------------------------
// Payment events (verified webhooks) — idempotent
// ---------------------------------------------------------------------------

export type PaymentEventInput = {
  provider: string;
  /** Unique id of this webhook delivery/event from the provider, used for deduplication. */
  providerEventId: string;
  type: "payment.succeeded" | "payment.failed";
  providerOrderId: string;
  providerPaymentId?: string;
  amountPaise: number;
  currency: string;
  payload?: unknown;
  now?: Date;
};

export type PaymentEventResult =
  | { status: "CONFIRMED"; orderId: string }
  | { status: "FAILED_RECORDED"; orderId: string }
  | { status: "DUPLICATE_EVENT" }
  | { status: "ALREADY_PROCESSED"; orderId: string }
  | { status: "UNKNOWN_ATTEMPT" }
  | { status: "AMOUNT_MISMATCH"; orderId: string }
  | { status: "REFUND_REQUIRED"; orderId: string; refundId: string; reason: "ITEM_UNAVAILABLE" | "ORDER_NOT_PAYABLE" };

class AllocationFailed extends Error {}

export async function handlePaymentEvent(db: Db, input: PaymentEventInput): Promise<PaymentEventResult> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(paymentEvents)
      .values({
        provider: input.provider,
        providerEventId: input.providerEventId,
        type: input.type,
        payload: (input.payload ?? {}) as object,
        receivedAt: now,
      })
      .onConflictDoNothing({ target: [paymentEvents.provider, paymentEvents.providerEventId] })
      .returning({ id: paymentEvents.id });
    if (inserted.length === 0) return { status: "DUPLICATE_EVENT" } as const;

    const [attempt] = await tx
      .select()
      .from(paymentAttempts)
      .where(and(eq(paymentAttempts.provider, input.provider), eq(paymentAttempts.providerOrderId, input.providerOrderId)))
      .for("update");
    if (!attempt) return { status: "UNKNOWN_ATTEMPT" } as const;
    if (attempt.status === "SUCCEEDED") return { status: "ALREADY_PROCESSED", orderId: attempt.orderId } as const;

    const [order] = await tx.select().from(orders).where(eq(orders.id, attempt.orderId)).for("update");
    if (!order) throw new Error(`payment attempt ${attempt.id} has no order`);
    const orderHoldIds = (
      await tx.select({ id: holds.id }).from(holds).where(eq(holds.orderId, order.id))
    ).map((h) => h.id);

    if (input.type === "payment.failed") {
      await tx
        .update(paymentAttempts)
        .set({ status: "FAILED", providerPaymentId: input.providerPaymentId, updatedAt: now })
        .where(eq(paymentAttempts.id, attempt.id));
      // The buyer may retry while the hold lasts.
      await tx
        .update(listings)
        .set({ status: "RESERVED", updatedAt: now })
        .where(
          and(eq(listings.status, "PAYMENT_PENDING"), inArray(listings.currentHoldId, orderHoldIds)),
        );
      return { status: "FAILED_RECORDED", orderId: order.id } as const;
    }

    if (input.amountPaise !== attempt.amountPaise || input.currency !== attempt.currency) {
      await tx
        .update(paymentAttempts)
        .set({ status: "UNKNOWN", providerPaymentId: input.providerPaymentId, updatedAt: now })
        .where(eq(paymentAttempts.id, attempt.id));
      await tx.insert(auditEvents).values({
        actorRole: "system",
        action: "payment.amount_mismatch",
        entity: "payment_attempt",
        entityId: attempt.id,
        after: { expected: attempt.amountPaise, got: input.amountPaise, currency: input.currency },
      });
      return { status: "AMOUNT_MISMATCH", orderId: order.id } as const;
    }

    await tx
      .update(paymentAttempts)
      .set({ status: "SUCCEEDED", providerPaymentId: input.providerPaymentId, updatedAt: now })
      .where(eq(paymentAttempts.id, attempt.id));

    const requestRefund = async (reason: "ITEM_UNAVAILABLE" | "ORDER_NOT_PAYABLE") => {
      const [refund] = await tx
        .insert(refunds)
        .values({ orderId: order.id, paymentAttemptId: attempt.id, amountPaise: attempt.amountPaise, reason })
        .returning({ id: refunds.id });
      await tx.insert(outboxEvents).values({
        type: "refund.requested",
        payload: { refundId: refund!.id, orderId: order.id, reason },
      });
      return { status: "REFUND_REQUIRED", orderId: order.id, refundId: refund!.id, reason } as const;
    };

    // Money arrived for an order that is already paid or cancelled (e.g. a second attempt).
    if (order.status !== "AWAITING_PAYMENT" && order.status !== "EXPIRED") {
      return requestRefund("ORDER_NOT_PAYABLE");
    }

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.listingId));

    try {
      // Savepoint: all items are allocated or none are.
      await tx.transaction(async (sp) => {
        for (const item of items) {
          // Allocate if this order still owns the item, or — for a late payment after the hold
          // expired — if nobody else has taken it in the meantime.
          const sold = await sp
            .update(listings)
            .set({ status: "SOLD", soldAt: now, currentHoldId: null, updatedAt: now })
            .where(
              and(
                eq(listings.id, item.listingId),
                or(inArray(listings.currentHoldId, orderHoldIds), eq(listings.status, "AVAILABLE")),
              ),
            )
            .returning({ id: listings.id });
          if (sold.length === 0) throw new AllocationFailed();
          await sp.update(orderItems).set({ allocated: true }).where(eq(orderItems.id, item.id));
        }
      });
    } catch (err) {
      if (!(err instanceof AllocationFailed)) throw err;
      // Someone else owns at least one garment now. Give back anything this order still holds and refund.
      const stillHeld = await tx
        .update(holds)
        .set({ status: "RELEASED", endedAt: now })
        .where(and(eq(holds.orderId, order.id), eq(holds.status, "ACTIVE")))
        .returning({ id: holds.id });
      for (const h of stillHeld) {
        await tx
          .update(listings)
          .set({ status: "AVAILABLE", currentHoldId: null, updatedAt: now })
          .where(eq(listings.currentHoldId, h.id));
      }
      await tx.update(orders).set({ status: "NEEDS_REFUND", updatedAt: now }).where(eq(orders.id, order.id));
      return requestRefund("ITEM_UNAVAILABLE");
    }

    await tx
      .update(holds)
      .set({ status: "CONVERTED", endedAt: now })
      .where(and(eq(holds.orderId, order.id), inArray(holds.status, ["ACTIVE", "EXPIRED"])));

    const [seller] = await tx.select({ dispatchDays: sellers.dispatchDays }).from(sellers).where(eq(sellers.id, order.sellerId));
    await tx
      .update(orders)
      .set({
        status: "CONFIRMED",
        confirmedAt: now,
        dispatchBy: addSeconds(now, (seller?.dispatchDays ?? 2) * 86_400),
        updatedAt: now,
      })
      .where(eq(orders.id, order.id));
    await tx.insert(outboxEvents).values({ type: "order.confirmed", payload: { orderId: order.id } });
    // Paid items leave the buyer's bag. (An abandoned checkout leaves the bag untouched.)
    await tx
      .delete(bagItems)
      .where(and(eq(bagItems.userId, order.buyerId), inArray(bagItems.listingId, items.map((i) => i.listingId))));
    return { status: "CONFIRMED", orderId: order.id } as const;
  });
}

// ---------------------------------------------------------------------------
// Expiry sweep (run every ~15 s by a job)
// ---------------------------------------------------------------------------

/** Marks holds expired, frees the items they still own, and expires orders left with no active hold. */
async function expireHoldRows(tx: Tx, due: { id: string; orderId: string }[], now: Date) {
  const ids = due.map((h) => h.id);
  await tx.update(holds).set({ status: "EXPIRED", endedAt: now }).where(inArray(holds.id, ids));
  // Generation check: only release items still owned by these exact holds.
  await tx
    .update(listings)
    .set({ status: "AVAILABLE", currentHoldId: null, updatedAt: now })
    .where(inArray(listings.currentHoldId, ids));

  const orderIds = [...new Set(due.map((h) => h.orderId))];
  await tx
    .update(orders)
    .set({ status: "EXPIRED", updatedAt: now })
    .where(
      and(
        inArray(orders.id, orderIds),
        eq(orders.status, "AWAITING_PAYMENT"),
        sql`NOT EXISTS (SELECT 1 FROM ${holds} WHERE ${holds.orderId} = ${orders.id} AND ${holds.status} = 'ACTIVE')`,
      ),
    );
}

export async function expireHolds(db: Db, opts: { now?: Date; limit?: number } = {}): Promise<{ expired: number }> {
  const now = opts.now ?? new Date();
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: holds.id, orderId: holds.orderId })
      .from(holds)
      .where(and(eq(holds.status, "ACTIVE"), lte(holds.expiresAt, now)))
      .limit(opts.limit ?? 200)
      .for("update", { skipLocked: true });
    if (due.length === 0) return { expired: 0 };

    await expireHoldRows(tx, due, now);
    return { expired: due.length };
  });
}

/** Buyer backs out of checkout. Only releases holds this order still owns. */
export async function releaseCheckout(db: Db, input: { orderId: string; buyerId: string; now?: Date }) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.buyerId, input.buyerId)))
      .for("update");
    if (!order || order.status !== "AWAITING_PAYMENT") return { ok: false as const };
    const [open] = await tx
      .select({ id: paymentAttempts.id })
      .from(paymentAttempts)
      .where(and(eq(paymentAttempts.orderId, order.id), inArray(paymentAttempts.status, ["PENDING", "UNKNOWN"])));
    // A payment may still complete; let expiry and reconciliation handle it.
    if (open) return { ok: false as const };

    const released = await tx
      .update(holds)
      .set({ status: "RELEASED", endedAt: now })
      .where(and(eq(holds.orderId, order.id), eq(holds.status, "ACTIVE")))
      .returning({ id: holds.id });
    if (released.length > 0) {
      await tx
        .update(listings)
        .set({ status: "AVAILABLE", currentHoldId: null, updatedAt: now })
        .where(inArray(listings.currentHoldId, released.map((h) => h.id)));
    }
    await tx.update(orders).set({ status: "CANCELLED_BY_BUYER", updatedAt: now }).where(eq(orders.id, order.id));
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// Seller: sold on Instagram / in person
// ---------------------------------------------------------------------------

export type MarkSoldElsewhereResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "BUYER_CHECKING_OUT" | "NOT_AVAILABLE" };

export async function markSoldElsewhere(
  db: Conn,
  input: { sellerId: string; listingId: string; actorUserId: string; now?: Date },
): Promise<MarkSoldElsewhereResult> {
  const now = input.now ?? new Date();
  const updated = await db
    .update(listings)
    .set({ status: "SOLD_ELSEWHERE", soldAt: now, updatedAt: now })
    .where(
      and(
        eq(listings.id, input.listingId),
        eq(listings.sellerId, input.sellerId),
        inArray(listings.status, ["AVAILABLE", "SCHEDULED", "DRAFT"]),
      ),
    )
    .returning({ id: listings.id });

  if (updated.length === 1) {
    await db.insert(auditEvents).values({
      actorId: input.actorUserId,
      actorRole: "seller",
      action: "listing.sold_elsewhere",
      entity: "listing",
      entityId: input.listingId,
    });
    return { ok: true };
  }

  const [current] = await db
    .select({ status: listings.status })
    .from(listings)
    .where(and(eq(listings.id, input.listingId), eq(listings.sellerId, input.sellerId)));
  if (!current) return { ok: false, reason: "NOT_FOUND" };
  if (current.status === "RESERVED" || current.status === "PAYMENT_PENDING") {
    return { ok: false, reason: "BUYER_CHECKING_OUT" };
  }
  return { ok: false, reason: "NOT_AVAILABLE" };
}
