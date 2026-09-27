import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { normalizeIndianMobile, SELLER_HANDLE_PATTERN, isValidPincode, INDIAN_STATES } from "@yolt/shared";
import {
  admins,
  auditEvents,
  claims,
  orderItems,
  orders,
  outboxEvents,
  refunds,
  sellers,
  shipments,
  users,
  type Db,
} from "@yolt/db";
import { requestFullRefund } from "./refunds";

/**
 * YOLT staff operations (docs/user-flows.md §6). Every function takes the acting admin's user
 * id, requires a reason for decisions, and writes an audit record in the same transaction.
 */

export type AdminRole = (typeof admins.$inferSelect)["role"];
/** Admin actions need a login (OTP) this recent: a simple step-up for money-moving actions. */
export const ADMIN_SESSION_MAX_AGE_HOURS = 12;

export async function getAdminRole(db: Db, userId: string): Promise<AdminRole | null> {
  const [row] = await db.select({ role: admins.role }).from(admins).where(eq(admins.userId, userId));
  return row?.role ?? null;
}

export function adminSessionFresh(sessionCreatedAt: Date, now = new Date()) {
  return now.getTime() - sessionCreatedAt.getTime() <= ADMIN_SESSION_MAX_AGE_HOURS * 3_600_000;
}

const reasonOk = (r: string) => r.trim().length >= 5;

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getAdminCounts(db: Db) {
  const [row] = await db.execute<{
    escalated_claims: number;
    open_claims: number;
    pending_kyc: number;
    refunds_requested: number;
    needs_refund_orders: number;
    rto_shipments: number;
  }>(sql`SELECT
    (SELECT count(*)::int FROM ${claims} WHERE status = 'ESCALATED') AS escalated_claims,
    (SELECT count(*)::int FROM ${claims} WHERE status = 'OPEN') AS open_claims,
    (SELECT count(*)::int FROM ${sellers} WHERE kyc_status <> 'VERIFIED' AND status <> 'REJECTED') AS pending_kyc,
    (SELECT count(*)::int FROM ${refunds} WHERE status IN ('REQUESTED', 'PROCESSING', 'FAILED')) AS refunds_requested,
    (SELECT count(*)::int FROM ${orders} WHERE status = 'NEEDS_REFUND') AS needs_refund_orders,
    (SELECT count(*)::int FROM ${shipments} WHERE status = 'RTO') AS rto_shipments`);
  return row!;
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export async function listClaimsForAdmin(db: Db, input: { status: "ESCALATED" | "OPEN" | "RESOLVED" }) {
  const statuses = input.status === "RESOLVED" ? (["REFUNDED", "REJECTED", "WITHDRAWN"] as const) : ([input.status] as const);
  return db
    .select({
      claim: claims,
      reference: orders.reference,
      totalPaise: orders.totalPaise,
      sellerName: sellers.displayName,
      firstItem: sql<{ title: string; photoUrl: string | null }>`(
        SELECT oi.snapshot FROM ${orderItems} oi WHERE oi.order_id = ${orders}.id ORDER BY oi.id LIMIT 1)`,
    })
    .from(claims)
    .innerJoin(orders, eq(orders.id, claims.orderId))
    .innerJoin(sellers, eq(sellers.id, claims.sellerId))
    .where(inArray(claims.status, [...statuses]))
    .orderBy(input.status === "RESOLVED" ? desc(claims.resolvedAt) : asc(claims.createdAt))
    .limit(100);
}

export type DecideClaimResult = { ok: true; refundId: string | null } | { ok: false; reason: "NOT_FOUND" | "NOT_DECIDABLE" | "REASON_REQUIRED" };

/** YOLT's decision on a claim (usually one the seller disputed). */
export async function decideClaim(
  db: Db,
  input: { adminUserId: string; claimId: string; decision: "REFUND" | "REJECT"; reason: string; now?: Date },
): Promise<DecideClaimResult> {
  if (!reasonOk(input.reason)) return { ok: false, reason: "REASON_REQUIRED" };
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [claim] = await tx.select().from(claims).where(eq(claims.id, input.claimId)).for("update");
    if (!claim) return { ok: false, reason: "NOT_FOUND" } as const;
    if (claim.status !== "ESCALATED" && claim.status !== "OPEN") return { ok: false, reason: "NOT_DECIDABLE" } as const;
    await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, claim.orderId)).for("update");

    const refundId = input.decision === "REFUND" ? await requestFullRefund(tx, { orderId: claim.orderId, reason: `CLAIM_${claim.reason}` }) : null;
    await tx
      .update(claims)
      .set({ status: input.decision === "REFUND" ? "REFUNDED" : "REJECTED", resolvedAt: now, refundId, updatedAt: now })
      .where(eq(claims.id, claim.id));
    await tx.insert(auditEvents).values({
      actorId: input.adminUserId,
      actorRole: "admin",
      action: input.decision === "REFUND" ? "claim.decided_refund" : "claim.decided_reject",
      entity: "claim",
      entityId: claim.id,
      before: { status: claim.status },
      reason: input.reason,
    });
    await tx.insert(outboxEvents).values({ type: "claim.decided", payload: { claimId: claim.id, decision: input.decision } });
    return { ok: true, refundId } as const;
  });
}

// ---------------------------------------------------------------------------
// Sellers
// ---------------------------------------------------------------------------

export async function listSellersForAdmin(db: Db) {
  return db
    .select({
      seller: sellers,
      phone: users.phone,
      liveListings: sql<number>`(SELECT count(*)::int FROM listings l WHERE l.seller_id = ${sellers}.id AND l.status = 'AVAILABLE')`,
      openClaims: sql<number>`(SELECT count(*)::int FROM ${claims} c WHERE c.seller_id = ${sellers}.id AND c.status IN ('OPEN', 'ESCALATED'))`,
    })
    .from(sellers)
    .innerJoin(users, eq(users.id, sellers.userId))
    .orderBy(desc(sellers.createdAt));
}

export type OnboardSellerInput = {
  adminUserId: string;
  phone: string;
  handle: string;
  displayName: string;
  instagramHandle?: string | null;
  pickupPincode: string;
  pickupState: string;
};

export type OnboardSellerResult =
  | { ok: true; sellerId: string }
  | { ok: false; reason: "INVALID"; field: string }
  | { ok: false; reason: "HANDLE_TAKEN" | "ALREADY_A_SELLER" };

/**
 * Pilot onboarding: staff set up an invited store. The store is approved but KYC starts
 * PENDING, so nothing can be published until staff have checked PAN and bank details.
 */
export async function onboardSeller(db: Db, input: OnboardSellerInput): Promise<OnboardSellerResult> {
  const phone = normalizeIndianMobile(input.phone);
  const handle = input.handle.trim().toLowerCase();
  const state = INDIAN_STATES.find((s) => s.toLowerCase() === input.pickupState.trim().toLowerCase());
  if (!phone) return { ok: false, reason: "INVALID", field: "phone" };
  if (!SELLER_HANDLE_PATTERN.test(handle)) return { ok: false, reason: "INVALID", field: "handle" };
  if (input.displayName.trim().length < 2) return { ok: false, reason: "INVALID", field: "displayName" };
  if (!isValidPincode(input.pickupPincode)) return { ok: false, reason: "INVALID", field: "pickupPincode" };
  if (!state) return { ok: false, reason: "INVALID", field: "pickupState" };

  return db.transaction(async (tx) => {
    const [inserted] = await tx.insert(users).values({ phone }).onConflictDoNothing({ target: users.phone }).returning({ id: users.id });
    const userId = inserted?.id ?? (await tx.select({ id: users.id }).from(users).where(eq(users.phone, phone)))[0]!.id;
    const [existing] = await tx.select({ id: sellers.id }).from(sellers).where(eq(sellers.userId, userId));
    if (existing) return { ok: false, reason: "ALREADY_A_SELLER" } as const;
    const [taken] = await tx.select({ id: sellers.id }).from(sellers).where(eq(sellers.handle, handle));
    if (taken) return { ok: false, reason: "HANDLE_TAKEN" } as const;

    const [seller] = await tx
      .insert(sellers)
      .values({
        userId,
        track: "STORE",
        status: "APPROVED",
        kycStatus: "PENDING",
        handle,
        displayName: input.displayName.trim(),
        instagramHandle: input.instagramHandle?.trim().replace(/^@/, "") || null,
        pickupPincode: input.pickupPincode.trim(),
        pickupState: state,
      })
      .returning({ id: sellers.id });
    await tx.insert(auditEvents).values({
      actorId: input.adminUserId,
      actorRole: "admin",
      action: "seller.onboarded",
      entity: "seller",
      entityId: seller!.id,
      after: { handle, phone: `…${phone.slice(-4)}` },
    });
    return { ok: true, sellerId: seller!.id } as const;
  });
}

export type SellerAction = "VERIFY_KYC" | "SUSPEND" | "REINSTATE";

/** KYC verified after staff check PAN and bank offline; suspend/reinstate hides or restores the store. */
export async function updateSellerStatus(
  db: Db,
  input: { adminUserId: string; sellerId: string; action: SellerAction; reason: string; now?: Date },
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" | "REASON_REQUIRED" | "NO_CHANGE" }> {
  if (!reasonOk(input.reason)) return { ok: false, reason: "REASON_REQUIRED" };
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [seller] = await tx.select().from(sellers).where(eq(sellers.id, input.sellerId)).for("update");
    if (!seller) return { ok: false, reason: "NOT_FOUND" } as const;
    const patch =
      input.action === "VERIFY_KYC"
        ? seller.kycStatus === "VERIFIED" ? null : { kycStatus: "VERIFIED" as const }
        : input.action === "SUSPEND"
          ? seller.status === "SUSPENDED" ? null : { status: "SUSPENDED" as const }
          : seller.status === "APPROVED" ? null : { status: "APPROVED" as const };
    if (!patch) return { ok: false, reason: "NO_CHANGE" } as const;
    await tx.update(sellers).set({ ...patch, updatedAt: now }).where(eq(sellers.id, seller.id));
    await tx.insert(auditEvents).values({
      actorId: input.adminUserId,
      actorRole: "admin",
      action: `seller.${input.action.toLowerCase()}`,
      entity: "seller",
      entityId: seller.id,
      before: { status: seller.status, kycStatus: seller.kycStatus },
      after: patch,
      reason: input.reason,
    });
    return { ok: true } as const;
  });
}

// ---------------------------------------------------------------------------
// Refunds and exceptions
// ---------------------------------------------------------------------------

export async function listRefundsForAdmin(db: Db, input: { open: boolean }) {
  return db
    .select({ refund: refunds, reference: orders.reference, orderStatus: orders.status })
    .from(refunds)
    .innerJoin(orders, eq(orders.id, refunds.orderId))
    .where(input.open ? inArray(refunds.status, ["REQUESTED", "PROCESSING", "FAILED"]) : inArray(refunds.status, ["SUCCEEDED"]))
    .orderBy(asc(refunds.createdAt))
    .limit(200);
}

/**
 * Until refunds run automatically through the payment provider, staff issue them in the
 * provider dashboard and record the provider's refund id here.
 */
export async function markRefundSucceeded(
  db: Db,
  input: { adminUserId: string; refundId: string; providerRefundId: string; now?: Date },
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" | "INVALID" }> {
  const providerRefundId = input.providerRefundId.trim();
  if (providerRefundId.length < 4 || providerRefundId.length > 100) return { ok: false, reason: "INVALID" };
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [r] = await tx
      .update(refunds)
      .set({ status: "SUCCEEDED", providerRefundId, updatedAt: now })
      .where(and(eq(refunds.id, input.refundId), inArray(refunds.status, ["REQUESTED", "PROCESSING", "FAILED"])))
      .returning({ id: refunds.id, orderId: refunds.orderId });
    if (!r) return { ok: false, reason: "NOT_FOUND" } as const;
    await tx.insert(auditEvents).values({
      actorId: input.adminUserId,
      actorRole: "admin",
      action: "refund.marked_succeeded",
      entity: "refund",
      entityId: r.id,
      after: { providerRefundId },
    });
    return { ok: true } as const;
  });
}

/** Paid-but-unallocated orders (late payments) and parcels returning to the seller. */
export async function listExceptions(db: Db) {
  const [needsRefund, rto] = await Promise.all([
    db.select({ id: orders.id, reference: orders.reference, totalPaise: orders.totalPaise, updatedAt: orders.updatedAt }).from(orders).where(eq(orders.status, "NEEDS_REFUND")).orderBy(asc(orders.updatedAt)),
    db
      .select({ orderId: shipments.orderId, awb: shipments.awb, courierName: shipments.courierName, reference: orders.reference, updatedAt: shipments.updatedAt })
      .from(shipments)
      .innerJoin(orders, eq(orders.id, shipments.orderId))
      .where(eq(shipments.status, "RTO"))
      .orderBy(asc(shipments.updatedAt)),
  ]);
  return { needsRefund, rto };
}

export async function listAuditEvents(db: Db, input: { limit?: number } = {}) {
  return db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(input.limit ?? 100);
}
