import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditEvents, outboxEvents, rateLimitHits, sellerApplications } from "@yolt/db";
import { APPLY_MAX_PER_IP_PER_HOUR, APPLY_MAX_PER_PHONE_PER_HOUR, applyToSell, listApplications, updateApplicationStatus } from "../src";
import { createUser, testDb, truncateAll } from "./fixtures";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));

const secrets = { pepper: "test-pepper" };
const form = (o: Partial<Parameters<typeof applyToSell>[2]> = {}) => ({
  storeName: "Retro Rack",
  instagramHandle: "@Retro.Rack",
  city: "Bengaluru",
  whatTheySell: "90s sportswear and denim",
  piecesPerMonth: "BETWEEN_20_50",
  phone: "98111 22233",
  ip: "1.2.3.4",
  ...o,
});

describe("applying to sell", () => {
  it("stores a normalised application for a guest and queues an outbox event", async () => {
    const r = await applyToSell(db, secrets, form());
    if (!r.ok) throw new Error(r.reason);
    expect(r).toMatchObject({ created: true, status: "NEW" });
    const [row] = await db.select().from(sellerApplications);
    expect(row).toMatchObject({ instagramHandle: "retro.rack", phone: "+919811122233", userId: null, status: "NEW", piecesPerMonth: "BETWEEN_20_50" });
    const events = await db.select().from(outboxEvents);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "seller_application.created", payload: { applicationId: r.id } });
  });

  it("links the signed-in user", async () => {
    const u = await createUser(db);
    await applyToSell(db, secrets, form({ userId: u.id }));
    expect((await db.select().from(sellerApplications))[0]!.userId).toBe(u.id);
  });

  it("validates every field", async () => {
    const bad = async (o: Partial<ReturnType<typeof form>>) => (await applyToSell(db, secrets, form(o)));
    expect(await bad({ storeName: "x" })).toEqual({ ok: false, reason: "INVALID", field: "storeName" });
    expect(await bad({ instagramHandle: "not a handle!" })).toEqual({ ok: false, reason: "INVALID", field: "instagramHandle" });
    expect(await bad({ city: " " })).toEqual({ ok: false, reason: "INVALID", field: "city" });
    expect(await bad({ whatTheySell: "hi" })).toEqual({ ok: false, reason: "INVALID", field: "whatTheySell" });
    expect(await bad({ piecesPerMonth: "LOTS" })).toEqual({ ok: false, reason: "INVALID", field: "piecesPerMonth" });
    expect(await bad({ phone: "12345" })).toEqual({ ok: false, reason: "INVALID", field: "phone" });
    expect(await db.select().from(sellerApplications)).toHaveLength(0);
    // Invalid submissions don't use up the rate limit.
    expect(await db.select().from(rateLimitHits)).toHaveLength(0);
  });

  it("returns the existing open application for the same phone, or the same handle, without a new row", async () => {
    const first = await applyToSell(db, secrets, form());
    if (!first.ok) throw new Error();
    const samePhone = await applyToSell(db, secrets, form({ instagramHandle: "other.store", phone: "+91 98111-22233" }));
    const sameHandle = await applyToSell(db, secrets, form({ phone: "9822233344", instagramHandle: "RETRO.RACK" }));
    expect(samePhone).toMatchObject({ ok: true, created: false, id: first.id });
    expect(sameHandle).toMatchObject({ ok: true, created: false, id: first.id });
    expect(await db.select().from(sellerApplications)).toHaveLength(1);
    expect(await db.select().from(outboxEvents)).toHaveLength(1);
  });

  it("concurrent identical submissions create one application", async () => {
    const results = await Promise.all(Array.from({ length: 3 }, () => applyToSell(db, secrets, form())));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await db.select().from(sellerApplications)).toHaveLength(1);
  });

  it("a rejected application doesn't block a fresh one from the same phone", async () => {
    const first = await applyToSell(db, secrets, form());
    if (!first.ok) throw new Error();
    const admin = await createUser(db);
    await updateApplicationStatus(db, { adminUserId: admin.id, applicationId: first.id, status: "REJECTED", reason: "Not a fit for the pilot" });
    const again = await applyToSell(db, secrets, form());
    expect(again).toMatchObject({ ok: true, created: true });
    expect(await db.select().from(sellerApplications)).toHaveLength(2);
  });
});

describe("rate limits", () => {
  it("limits repeat submissions per phone, counting duplicates too", async () => {
    const results = [];
    for (let i = 0; i <= APPLY_MAX_PER_PHONE_PER_HOUR; i++) results.push(await applyToSell(db, secrets, form({ ip: `10.0.0.${i}` })));
    expect(results.slice(0, APPLY_MAX_PER_PHONE_PER_HOUR).every((r) => r.ok)).toBe(true);
    expect(results.at(-1)).toMatchObject({ ok: false, reason: "RATE_LIMITED", retryAfterSeconds: expect.any(Number) });
  });

  it("limits submissions per network across different phones", async () => {
    const now = new Date();
    for (let i = 0; i < APPLY_MAX_PER_IP_PER_HOUR; i++) {
      const r = await applyToSell(db, secrets, form({ phone: `98111000${String(i).padStart(2, "0")}`, instagramHandle: `store${i}`, now }));
      expect(r.ok).toBe(true);
    }
    const blocked = await applyToSell(db, secrets, form({ phone: "9811100099", instagramHandle: "store99", now }));
    expect(blocked).toMatchObject({ ok: false, reason: "RATE_LIMITED" });
    // Another network is unaffected, and the window slides.
    expect((await applyToSell(db, secrets, form({ phone: "9811100098", instagramHandle: "store98", ip: "9.9.9.9", now }))).ok).toBe(true);
    const later = new Date(now.getTime() + 3_601_000);
    expect((await applyToSell(db, secrets, form({ phone: "9811100097", instagramHandle: "store97", now: later }))).ok).toBe(true);
  });

  it("stores no raw IP or phone in the rate-limit log", async () => {
    await applyToSell(db, secrets, form());
    const keys = (await db.select().from(rateLimitHits)).map((h) => h.key).join(" ");
    expect(keys).not.toContain("1.2.3.4");
    expect(keys).not.toContain("9811122233");
  });
});

describe("staff queue", () => {
  async function seeded() {
    const a = await applyToSell(db, secrets, form());
    const b = await applyToSell(db, secrets, form({ phone: "9822233344", instagramHandle: "second.store", ip: "5.5.5.5" }));
    if (!a.ok || !b.ok) throw new Error();
    return { a, b, admin: await createUser(db, "Admin") };
  }

  it("lists newest first and filters by status", async () => {
    const { a, b, admin } = await seeded();
    expect((await listApplications(db)).map((r) => r.application.id)).toEqual([b.id, a.id]);
    await updateApplicationStatus(db, { adminUserId: admin.id, applicationId: a.id, status: "CONTACTED", reason: "Called, onboarding Friday" });
    expect((await listApplications(db, { status: "CONTACTED" })).map((r) => r.application.id)).toEqual([a.id]);
    expect((await listApplications(db, { status: "NEW" })).map((r) => r.application.id)).toEqual([b.id]);
  });

  it("changes status with a reason, optionally the note, and audits before and after", async () => {
    const { a, admin } = await seeded();
    expect(await updateApplicationStatus(db, { adminUserId: admin.id, applicationId: a.id, status: "CONTACTED", reason: "" })).toEqual({ ok: false, reason: "REASON_REQUIRED" });
    const r = await updateApplicationStatus(db, { adminUserId: admin.id, applicationId: a.id, status: "CONTACTED", note: "  Prefers WhatsApp ", reason: "Called today" });
    if (!r.ok) throw new Error(r.reason);
    expect(r.application).toMatchObject({ status: "CONTACTED", adminNote: "Prefers WhatsApp" });
    const [audit] = await db.select().from(auditEvents).where(eq(auditEvents.entityId, a.id));
    expect(audit).toMatchObject({ actorId: admin.id, action: "seller_application.status_changed", reason: "Called today", before: { status: "NEW" }, after: { status: "CONTACTED" } });
  });

  it("rejects no-op changes, missing applications and over-long notes", async () => {
    const { a, admin } = await seeded();
    const missing = "00000000-0000-4000-8000-000000000000";
    expect(await updateApplicationStatus(db, { adminUserId: admin.id, applicationId: a.id, status: "NEW", reason: "No change here" })).toEqual({ ok: false, reason: "NO_CHANGE" });
    expect(await updateApplicationStatus(db, { adminUserId: admin.id, applicationId: missing, status: "CONTACTED", reason: "Missing one" })).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await updateApplicationStatus(db, { adminUserId: admin.id, applicationId: a.id, status: "CONTACTED", note: "x".repeat(1001), reason: "Long note" })).toEqual({ ok: false, reason: "NOTE_TOO_LONG" });
  });

  it("won't reopen a rejected application when the same phone has a newer open one", async () => {
    const first = await applyToSell(db, secrets, form());
    if (!first.ok) throw new Error();
    const admin = await createUser(db);
    await updateApplicationStatus(db, { adminUserId: admin.id, applicationId: first.id, status: "REJECTED", reason: "Not a fit yet" });
    await applyToSell(db, secrets, form());
    expect(await updateApplicationStatus(db, { adminUserId: admin.id, applicationId: first.id, status: "NEW", reason: "Reopening it" })).toEqual({ ok: false, reason: "OPEN_DUPLICATE_EXISTS" });
  });
});
