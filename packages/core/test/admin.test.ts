import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditEvents, claims, refunds, sellers } from "@yolt/db";
import {
  adminSessionFresh,
  createCheckout,
  decideClaim,
  getAdminCounts,
  listRefundsForAdmin,
  markRefundSucceeded,
  onboardSeller,
  openClaim,
  publishListing,
  respondToClaim,
  updateSellerStatus,
} from "../src";
import { createListing, createSeller, createUser, deliveredOrder, testDb, truncateAll } from "./fixtures";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));

async function escalatedClaim() {
  const p = await deliveredOrder(db);
  const c = await openClaim(db, { buyerId: p.buyer.id, orderId: p.orderId, reason: "WRONG_ITEM", description: "Different jacket", photoUrls: ["https://media.test/x.webp"] });
  if (!c.ok) throw new Error(c.reason);
  await respondToClaim(db, { sellerId: p.seller.id, claimId: c.claimId, actorUserId: p.owner.id, action: "DISPUTE", response: "It's the listed one" });
  return { ...p, claimId: c.claimId };
}

describe("claim decisions", () => {
  it("refund decision refunds in full and is audited with the reason", async () => {
    const p = await escalatedClaim();
    const admin = await createUser(db, "Admin");
    expect(await decideClaim(db, { adminUserId: admin.id, claimId: p.claimId, decision: "REFUND", reason: "Label in buyer photo doesn't match listing" })).toMatchObject({
      ok: true,
      refundId: expect.any(String),
    });
    expect((await db.select().from(claims))[0]!.status).toBe("REFUNDED");
    const [audit] = await db.select().from(auditEvents).where(eq(auditEvents.action, "claim.decided_refund"));
    expect(audit).toMatchObject({ actorId: admin.id, actorRole: "admin", reason: "Label in buyer photo doesn't match listing" });
  });

  it("reject needs a reason, can't be decided twice, and issues no refund", async () => {
    const p = await escalatedClaim();
    const admin = await createUser(db);
    expect(await decideClaim(db, { adminUserId: admin.id, claimId: p.claimId, decision: "REJECT", reason: "" })).toEqual({ ok: false, reason: "REASON_REQUIRED" });
    expect((await decideClaim(db, { adminUserId: admin.id, claimId: p.claimId, decision: "REJECT", reason: "Matches listing photos" })).ok).toBe(true);
    expect(await decideClaim(db, { adminUserId: admin.id, claimId: p.claimId, decision: "REFUND", reason: "Changed my mind" })).toEqual({ ok: false, reason: "NOT_DECIDABLE" });
    expect(await db.select().from(refunds)).toHaveLength(0);
  });
});

describe("sellers", () => {
  it("onboards an invited store: approved, but can't publish until KYC is verified", async () => {
    const admin = await createUser(db);
    const r = await onboardSeller(db, { adminUserId: admin.id, phone: "98111 22233", handle: "RetroRack", displayName: "Retro Rack", instagramHandle: "@retrorack.in", pickupPincode: "560001", pickupState: "karnataka" });
    if (!r.ok) throw new Error(r.reason);
    const [s] = await db.select().from(sellers).where(eq(sellers.id, r.sellerId));
    expect(s).toMatchObject({ handle: "retrorack", status: "APPROVED", kycStatus: "PENDING", instagramHandle: "retrorack.in", pickupState: "Karnataka" });

    const draft = await createListing(db, s!.id, { status: "DRAFT", publishedAt: null });
    expect(await publishListing(db, { sellerId: s!.id, listingId: draft.id, actorUserId: s!.userId })).toEqual({ ok: false, reason: "SELLER_NOT_VERIFIED" });
    expect((await updateSellerStatus(db, { adminUserId: admin.id, sellerId: s!.id, action: "VERIFY_KYC", reason: "PAN and bank checked on call" })).ok).toBe(true);
  });

  it("rejects bad input and duplicate handles or sellers", async () => {
    const admin = await createUser(db);
    const base = { adminUserId: admin.id, phone: "9811122233", handle: "retrorack", displayName: "Retro Rack", pickupPincode: "560001", pickupState: "Karnataka" };
    expect(await onboardSeller(db, { ...base, pickupPincode: "0123" })).toMatchObject({ ok: false, field: "pickupPincode" });
    expect(await onboardSeller(db, { ...base, handle: "no spaces!" })).toMatchObject({ ok: false, field: "handle" });
    expect((await onboardSeller(db, base)).ok).toBe(true);
    expect(await onboardSeller(db, { ...base, phone: "9822233344" })).toEqual({ ok: false, reason: "HANDLE_TAKEN" });
    expect(await onboardSeller(db, { ...base, handle: "other" })).toEqual({ ok: false, reason: "ALREADY_A_SELLER" });
  });

  it("a suspended store can't sell, even through a direct product link", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const admin = await createUser(db);
    const buyer = await createUser(db);
    expect((await updateSellerStatus(db, { adminUserId: admin.id, sellerId: seller.id, action: "SUSPEND", reason: "Repeated undisclosed flaws" })).ok).toBe(true);
    expect(await createCheckout(db, { buyerId: buyer.id, listingIds: [l.id] })).toEqual({ ok: false, reason: "SELLER_UNAVAILABLE" });

    await updateSellerStatus(db, { adminUserId: admin.id, sellerId: seller.id, action: "REINSTATE", reason: "Appeal accepted" });
    expect((await createCheckout(db, { buyerId: buyer.id, listingIds: [l.id] })).ok).toBe(true);
    expect(await updateSellerStatus(db, { adminUserId: admin.id, sellerId: seller.id, action: "REINSTATE", reason: "Again" })).toEqual({ ok: false, reason: "NO_CHANGE" });
  });
});

describe("refunds and dashboard", () => {
  it("staff record a provider refund id; the queue and counts update", async () => {
    const p = await escalatedClaim();
    const admin = await createUser(db);
    await decideClaim(db, { adminUserId: admin.id, claimId: p.claimId, decision: "REFUND", reason: "Wrong item confirmed" });
    expect((await getAdminCounts(db)).refunds_requested).toBe(1);

    const [open] = await listRefundsForAdmin(db, { open: true });
    expect(await markRefundSucceeded(db, { adminUserId: admin.id, refundId: open!.refund.id, providerRefundId: "x" })).toEqual({ ok: false, reason: "INVALID" });
    expect((await markRefundSucceeded(db, { adminUserId: admin.id, refundId: open!.refund.id, providerRefundId: "rfnd_ABC123" })).ok).toBe(true);
    expect(await listRefundsForAdmin(db, { open: true })).toHaveLength(0);
    expect((await getAdminCounts(db)).refunds_requested).toBe(0);
  });

  it("admin sessions go stale after 12 hours", () => {
    const now = new Date();
    expect(adminSessionFresh(new Date(now.getTime() - 11 * 3_600_000), now)).toBe(true);
    expect(adminSessionFresh(new Date(now.getTime() - 13 * 3_600_000), now)).toBe(false);
  });
});
