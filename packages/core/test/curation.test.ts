import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditEvents, homepageSlots, listings } from "@yolt/db";
import { createSlot, deleteSlot, listSlots, updateSlot } from "../src";
import { createListing, createSeller, createUser, testDb, truncateAll } from "./fixtures";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));

const DAY = 86_400_000;

async function setup() {
  const { seller } = await createSeller(db);
  const admin = await createUser(db, "Admin");
  const l = [await createListing(db, seller.id), await createListing(db, seller.id), await createListing(db, seller.id)];
  return { seller, admin, l };
}

describe("creating slots", () => {
  it("creates a grails list and audits it with the reason", async () => {
    const { admin, l } = await setup();
    const r = await createSlot(db, { adminUserId: admin.id, kind: "GRAILS", listingIds: l.map((x) => x.id), reason: "Autumn grails" });
    if (!r.ok) throw new Error(r.reason);
    expect(r.slot.listingIds).toEqual(l.map((x) => x.id));
    const [audit] = await db.select().from(auditEvents).where(eq(auditEvents.action, "homepage_slot.created"));
    expect(audit).toMatchObject({ actorId: admin.id, actorRole: "admin", entity: "homepage_slot", entityId: r.slot.id, reason: "Autumn grails" });
  });

  it("requires a reason", async () => {
    const { admin, l } = await setup();
    expect(await createSlot(db, { adminUserId: admin.id, kind: "GRAILS", listingIds: [l[0]!.id], reason: " " })).toEqual({ ok: false, reason: "REASON_REQUIRED" });
    expect(await db.select().from(homepageSlots)).toHaveLength(0);
  });

  it("rejects listings that don't exist or aren't live, naming them", async () => {
    const { seller, admin, l } = await setup();
    const draft = await createListing(db, seller.id, { status: "DRAFT", publishedAt: null });
    const sold = await createListing(db, seller.id, { status: "SOLD", soldAt: new Date() });
    const missing = "00000000-0000-4000-8000-000000000000";
    const r = await createSlot(db, { adminUserId: admin.id, kind: "GRAILS", listingIds: [l[0]!.id, draft.id, sold.id, missing], reason: "Check validation" });
    expect(r).toEqual({ ok: false, reason: "LISTINGS_NOT_LIVE", listingIds: [draft.id, sold.id, missing] });
  });

  it("accepts reserved pieces, and rejects pieces of a suspended store", async () => {
    const { seller, admin } = await setup();
    const { seller: bad } = await createSeller(db, { status: "SUSPENDED" });
    const hidden = await createListing(db, bad.id);
    const reserved = await createListing(db, seller.id, { status: "RESERVED", currentHoldId: randomUUID() });
    expect((await createSlot(db, { adminUserId: admin.id, kind: "GRAILS", listingIds: [hidden.id], reason: "Suspended store" })).ok).toBe(false);
    expect((await createSlot(db, { adminUserId: admin.id, kind: "GRAILS", listingIds: [reserved.id], reason: "Fine piece" })).ok).toBe(true);
  });

  it("enforces 1 to 12 unique pieces", async () => {
    const { seller, admin, l } = await setup();
    const ids = [];
    for (let i = 0; i < 13; i++) ids.push((await createListing(db, seller.id)).id);
    const invalid = { ok: false, reason: "INVALID", field: "listingIds" };
    expect(await createSlot(db, { adminUserId: admin.id, kind: "GRAILS", listingIds: ids, reason: "Too many" })).toEqual(invalid);
    expect(await createSlot(db, { adminUserId: admin.id, kind: "GRAILS", listingIds: [], reason: "Too few" })).toEqual(invalid);
    expect(await createSlot(db, { adminUserId: admin.id, kind: "GRAILS", listingIds: [l[0]!.id, l[0]!.id], reason: "Duplicate" })).toEqual(invalid);
    expect((await createSlot(db, { adminUserId: admin.id, kind: "GRAILS", listingIds: ids.slice(0, 12), reason: "Exactly twelve" })).ok).toBe(true);
  });

  it("an edit needs a 3 to 40 character title; grails take none", async () => {
    const { admin, l } = await setup();
    const base = { adminUserId: admin.id, listingIds: [l[0]!.id], reason: "Edit check" };
    const bad = { ok: false, reason: "INVALID", field: "title" };
    expect(await createSlot(db, { ...base, kind: "EDIT" })).toEqual(bad);
    expect(await createSlot(db, { ...base, kind: "EDIT", title: "ab" })).toEqual(bad);
    expect(await createSlot(db, { ...base, kind: "EDIT", title: "x".repeat(41) })).toEqual(bad);
    expect((await createSlot(db, { ...base, kind: "EDIT", title: "  Monsoon   layers " })).ok).toBe(true);
    expect((await db.select().from(homepageSlots))[0]!.title).toBe("Monsoon layers");
    expect(await createSlot(db, { ...base, kind: "GRAILS", title: "Nope" })).toEqual(bad);
  });

  it("a featured store must be an approved store; the window must run forwards", async () => {
    const { seller, admin } = await setup();
    const { seller: pending } = await createSeller(db, { status: "APPLIED" });
    const base = { adminUserId: admin.id, kind: "FEATURED_STORE" as const, reason: "Store of the week" };
    expect(await createSlot(db, { ...base, sellerId: pending.id })).toEqual({ ok: false, reason: "STORE_NOT_APPROVED" });
    expect(await createSlot(db, { ...base })).toEqual({ ok: false, reason: "INVALID", field: "sellerId" });
    const now = new Date();
    expect(await createSlot(db, { ...base, sellerId: seller.id, startsAt: now, endsAt: now })).toEqual({ ok: false, reason: "INVALID", field: "window" });
    expect((await createSlot(db, { ...base, sellerId: seller.id, startsAt: now, endsAt: new Date(now.getTime() + DAY) })).ok).toBe(true);
  });
});

describe("updating and deleting", () => {
  it("updates only the given fields, re-validates, and records before and after", async () => {
    const { admin, l } = await setup();
    const created = await createSlot(db, { adminUserId: admin.id, kind: "EDIT", title: "Winter edit", listingIds: [l[0]!.id], reason: "First draft" });
    if (!created.ok) throw new Error();
    const id = created.slot.id;

    expect(await updateSlot(db, { adminUserId: admin.id, slotId: id, patch: { title: "Warmer" }, reason: "" })).toEqual({ ok: false, reason: "REASON_REQUIRED" });
    expect(await updateSlot(db, { adminUserId: admin.id, slotId: id, patch: { title: "No" }, reason: "Too short title" })).toEqual({ ok: false, reason: "INVALID", field: "title" });

    const r = await updateSlot(db, { adminUserId: admin.id, slotId: id, patch: { title: "Warmer layers", listingIds: [l[1]!.id, l[0]!.id] }, reason: "Reordered for the weekend" });
    if (!r.ok) throw new Error(r.reason);
    expect(r.slot).toMatchObject({ title: "Warmer layers", listingIds: [l[1]!.id, l[0]!.id], kind: "EDIT" });
    const [audit] = await db.select().from(auditEvents).where(eq(auditEvents.action, "homepage_slot.updated"));
    expect(audit).toMatchObject({ reason: "Reordered for the weekend", before: { title: "Winter edit" }, after: { title: "Warmer layers" } });
  });

  it("re-checks that pieces are live when they are changed", async () => {
    const { admin, l } = await setup();
    const created = await createSlot(db, { adminUserId: admin.id, kind: "GRAILS", listingIds: [l[0]!.id], reason: "First draft" });
    if (!created.ok) throw new Error();
    await db.update(listings).set({ status: "SOLD", soldAt: new Date() }).where(eq(listings.id, l[1]!.id));
    expect(await updateSlot(db, { adminUserId: admin.id, slotId: created.slot.id, patch: { listingIds: [l[1]!.id] }, reason: "Swap in sold piece" })).toEqual({
      ok: false,
      reason: "LISTINGS_NOT_LIVE",
      listingIds: [l[1]!.id],
    });
  });

  it("unknown slots are NOT_FOUND; delete removes the slot and audits it", async () => {
    const { admin, l } = await setup();
    const missing = "00000000-0000-4000-8000-000000000000";
    expect(await updateSlot(db, { adminUserId: admin.id, slotId: missing, patch: {}, reason: "Does not exist" })).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await deleteSlot(db, { adminUserId: admin.id, slotId: missing, reason: "Does not exist" })).toEqual({ ok: false, reason: "NOT_FOUND" });

    const created = await createSlot(db, { adminUserId: admin.id, kind: "GRAILS", listingIds: [l[0]!.id], reason: "First draft" });
    if (!created.ok) throw new Error();
    expect(await deleteSlot(db, { adminUserId: admin.id, slotId: created.slot.id, reason: "x" })).toEqual({ ok: false, reason: "REASON_REQUIRED" });
    expect(await deleteSlot(db, { adminUserId: admin.id, slotId: created.slot.id, reason: "Replaced by new list" })).toEqual({ ok: true });
    expect(await db.select().from(homepageSlots)).toHaveLength(0);
    const [audit] = await db.select().from(auditEvents).where(eq(auditEvents.action, "homepage_slot.deleted"));
    expect(audit).toMatchObject({ entityId: created.slot.id, reason: "Replaced by new list", before: { kind: "GRAILS" } });
  });
});

describe("listing slots", () => {
  it("marks each slot current, upcoming or expired, and flags the one that wins", async () => {
    const { admin, l } = await setup();
    const now = new Date();
    const mk = (createdAt: Date, startsAt: Date | null, endsAt: Date | null) =>
      createSlot(db, { adminUserId: admin.id, kind: "GRAILS", listingIds: [l[0]!.id], reason: "State check", startsAt, endsAt, now: createdAt });
    await mk(new Date(now.getTime() - 4 * DAY), null, null);
    await mk(new Date(now.getTime() - 3 * DAY), new Date(now.getTime() - 2 * DAY), new Date(now.getTime() - DAY));
    await mk(new Date(now.getTime() - 2 * DAY), new Date(now.getTime() + DAY), null);
    await mk(new Date(now.getTime() - DAY), null, null);

    const rows = await listSlots(db, now);
    expect(rows.map((r) => [r.state, r.winning])).toEqual([
      ["CURRENT", true],
      ["UPCOMING", false],
      ["EXPIRED", false],
      ["CURRENT", false],
    ]);
  });
});
