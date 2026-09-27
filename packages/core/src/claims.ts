import { and, desc, eq, inArray } from "drizzle-orm";
import { auditEvents, claims, orders, outboxEvents, type Db } from "@yolt/db";
import { RETURN_WINDOW_HOURS } from "./fulfilment";
import { requestFullRefund } from "./refunds";

/**
 * Buyer protection (decision D6). No size returns. A buyer can report that an item isn't as
 * described, arrived damaged, is the wrong item, or never arrived. The seller accepts (full
 * refund) or disputes (YOLT decides). Consumer Protection (E-Commerce) Rules 2020 require
 * refunds for defective, not-as-described or undelivered goods.
 */

export type ClaimReason = (typeof claims.$inferSelect)["reason"];
/** A shipped parcel this late counts as not received. */
export const NOT_RECEIVED_AFTER_DAYS = 10;
const EVIDENCE_REQUIRED: ClaimReason[] = ["NOT_AS_DESCRIBED", "DAMAGED", "WRONG_ITEM"];
const hours = (n: number) => n * 3_600_000;

export type ClaimWindow = { open: true; closesAt: Date | null } | { open: false; reason: string };

/** Whether this order can take a claim now, and until when. Shown on the buyer's order page. */
export function claimWindow(
  order: { status: string; deliveredAt: Date | null; shippedAt: Date | null },
  reason: ClaimReason | null,
  now = new Date(),
): ClaimWindow {
  if (order.status === "DELIVERED" && order.deliveredAt) {
    const closesAt = new Date(order.deliveredAt.getTime() + hours(RETURN_WINDOW_HOURS));
    return now < closesAt ? { open: true, closesAt } : { open: false, reason: "WINDOW_CLOSED" };
  }
  if (order.status === "SHIPPED" && order.shippedAt && (reason === null || reason === "NOT_RECEIVED")) {
    const lateFrom = new Date(order.shippedAt.getTime() + NOT_RECEIVED_AFTER_DAYS * 86_400_000);
    return now >= lateFrom ? { open: true, closesAt: null } : { open: false, reason: "TOO_EARLY" };
  }
  return { open: false, reason: "NOT_ELIGIBLE" };
}

export type OpenClaimResult =
  | { ok: true; claimId: string }
  | { ok: false; reason: "NOT_FOUND" | "NOT_ELIGIBLE" | "WINDOW_CLOSED" | "TOO_EARLY" | "EVIDENCE_REQUIRED" | "ALREADY_CLAIMED" };

export async function openClaim(
  db: Db,
  input: { buyerId: string; orderId: string; reason: ClaimReason; description: string; photoUrls: string[]; now?: Date },
): Promise<OpenClaimResult> {
  const now = input.now ?? new Date();
  if (EVIDENCE_REQUIRED.includes(input.reason) && input.photoUrls.length === 0) return { ok: false, reason: "EVIDENCE_REQUIRED" };
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.buyerId, input.buyerId)))
      .for("update");
    if (!order) return { ok: false, reason: "NOT_FOUND" } as const;
    const window = claimWindow(order, input.reason, now);
    if (!window.open) return { ok: false, reason: window.reason as "NOT_ELIGIBLE" | "WINDOW_CLOSED" | "TOO_EARLY" } as const;

    const inserted = await tx
      .insert(claims)
      .values({
        orderId: order.id,
        buyerId: input.buyerId,
        sellerId: order.sellerId,
        reason: input.reason,
        description: input.description,
        photoUrls: input.photoUrls,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: claims.orderId })
      .returning({ id: claims.id });
    if (inserted.length === 0) return { ok: false, reason: "ALREADY_CLAIMED" } as const;
    await tx.insert(outboxEvents).values({ type: "claim.opened", payload: { claimId: inserted[0]!.id, orderId: order.id } });
    return { ok: true, claimId: inserted[0]!.id } as const;
  });
}

export type RespondResult = { ok: true; refundId: string | null } | { ok: false; reason: "NOT_FOUND" | "NOT_OPEN" };

/** Seller accepts (full refund now) or disputes (escalated to YOLT with the seller's side). */
export async function respondToClaim(
  db: Db,
  input: { sellerId: string; claimId: string; actorUserId: string; action: "ACCEPT" | "DISPUTE"; response: string; now?: Date },
): Promise<RespondResult> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [claim] = await tx
      .select()
      .from(claims)
      .where(and(eq(claims.id, input.claimId), eq(claims.sellerId, input.sellerId)))
      .for("update");
    if (!claim) return { ok: false, reason: "NOT_FOUND" } as const;
    if (claim.status !== "OPEN") return { ok: false, reason: "NOT_OPEN" } as const;
    // Lock the order too, so a refund can't race a cancellation.
    await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, claim.orderId)).for("update");

    if (input.action === "ACCEPT") {
      const refundId = await requestFullRefund(tx, { orderId: claim.orderId, reason: `CLAIM_${claim.reason}` });
      await tx
        .update(claims)
        .set({ status: "REFUNDED", sellerResponse: input.response, sellerRespondedAt: now, resolvedAt: now, refundId, updatedAt: now })
        .where(eq(claims.id, claim.id));
      await tx.insert(auditEvents).values({
        actorId: input.actorUserId,
        actorRole: "seller",
        action: "claim.accepted",
        entity: "claim",
        entityId: claim.id,
      });
      return { ok: true, refundId } as const;
    }

    await tx
      .update(claims)
      .set({ status: "ESCALATED", sellerResponse: input.response, sellerRespondedAt: now, updatedAt: now })
      .where(eq(claims.id, claim.id));
    await tx.insert(outboxEvents).values({ type: "claim.escalated", payload: { claimId: claim.id, orderId: claim.orderId } });
    await tx.insert(auditEvents).values({
      actorId: input.actorUserId,
      actorRole: "seller",
      action: "claim.disputed",
      entity: "claim",
      entityId: claim.id,
      reason: input.response,
    });
    return { ok: true, refundId: null } as const;
  });
}

/** Buyer changed their mind (e.g. the parcel turned up). Only while the seller hasn't resolved it. */
export async function withdrawClaim(db: Db, input: { buyerId: string; claimId: string; now?: Date }) {
  const now = input.now ?? new Date();
  const r = await db
    .update(claims)
    .set({ status: "WITHDRAWN", resolvedAt: now, updatedAt: now })
    .where(and(eq(claims.id, input.claimId), eq(claims.buyerId, input.buyerId), inArray(claims.status, ["OPEN", "ESCALATED"])))
    .returning({ id: claims.id });
  return r.length === 1 ? ({ ok: true } as const) : ({ ok: false, reason: "NOT_OPEN" } as const);
}

export async function getClaimForOrder(db: Db, orderId: string) {
  const [c] = await db.select().from(claims).where(eq(claims.orderId, orderId));
  return c ?? null;
}

/** Claims waiting for this seller, oldest first — they should be answered quickly. */
export async function getOpenClaimsForSeller(db: Db, sellerId: string) {
  return db
    .select({ claim: claims, reference: orders.reference })
    .from(claims)
    .innerJoin(orders, eq(orders.id, claims.orderId))
    .where(and(eq(claims.sellerId, sellerId), eq(claims.status, "OPEN")))
    .orderBy(desc(claims.createdAt));
}
