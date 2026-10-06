import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSession } from "@yolt/core";
import { admins, auditEvents, homepageSlots, sellerApplications } from "@yolt/db";
import { SESSION_COOKIE } from "../src";
import { createListing, createSeller, createUser, testDb, truncateAll } from "../../core/test/fixtures";
import { makeApp } from "./helpers";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));
const { app } = makeApp(db);

async function staff(role: "ADMIN" | "SUPPORT", sessionAgeHours = 0) {
  const u = await createUser(db, `${role} person`);
  await db.insert(admins).values({ userId: u.id, role, grantedBy: "test" });
  const s = await createSession(db, { userId: u.id, now: new Date(Date.now() - sessionAgeHours * 3_600_000) });
  return { user: u, cookie: `${SESSION_COOKIE}=${s.sessionToken}` };
}
const call = (method: string, path: string, cookie: string | null, body?: unknown) =>
  app.request(`/api/admin${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("homepage curation access", () => {
  it("is staff only: signed out 401, non-staff 404, stale session 401 REAUTH_REQUIRED", async () => {
    expect((await call("GET", "/homepage-slots", null)).status).toBe(401);
    const u = await createUser(db);
    const s = await createSession(db, { userId: u.id });
    expect((await call("GET", "/homepage-slots", `${SESSION_COOKIE}=${s.sessionToken}`)).status).toBe(404);
    const stale = await staff("ADMIN", 13);
    const r = await call("POST", "/homepage-slots", stale.cookie, { kind: "GRAILS", listingIds: [], reason: "Stale session" });
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "REAUTH_REQUIRED" });
  });

  it("SUPPORT can read but every write is 403", async () => {
    const admin = await staff("ADMIN");
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const created = (await (await call("POST", "/homepage-slots", admin.cookie, { kind: "GRAILS", listingIds: [l.id], reason: "Weekly grails" })).json()) as { id: string };

    const support = await staff("SUPPORT");
    expect((await call("GET", "/homepage-slots", support.cookie)).status).toBe(200);
    expect((await call("GET", "/applications", support.cookie)).status).toBe(200);
    expect((await call("POST", "/homepage-slots", support.cookie, { kind: "GRAILS", listingIds: [l.id], reason: "Not allowed" })).status).toBe(403);
    expect((await call("PATCH", `/homepage-slots/${created.id}`, support.cookie, { listingIds: [l.id], reason: "Not allowed" })).status).toBe(403);
    expect((await call("DELETE", `/homepage-slots/${created.id}`, support.cookie, { reason: "Not allowed" })).status).toBe(403);
    expect((await call("POST", "/applications/00000000-0000-4000-8000-000000000000/status", support.cookie, { status: "CONTACTED", reason: "Not allowed" })).status).toBe(403);
    expect(await db.select().from(homepageSlots)).toHaveLength(1);
  });
});

describe("homepage curation over HTTP", () => {
  it("create, list, update and delete, each audited with its reason", async () => {
    const { cookie, user } = await staff("ADMIN");
    const { seller } = await createSeller(db);
    const [a, b] = [await createListing(db, seller.id), await createListing(db, seller.id)];

    const created = await call("POST", "/homepage-slots", cookie, { kind: "EDIT", title: "Monsoon layers", listingIds: [a.id, b.id], startsAt: null, endsAt: new Date(Date.now() + 86_400_000).toISOString(), reason: "Weekly edit" });
    expect(created.status).toBe(201);
    const slot = (await created.json()) as { id: string; listingIds: string[] };
    expect(slot.listingIds).toEqual([a.id, b.id]);

    const list = (await (await call("GET", "/homepage-slots", cookie)).json()) as { slot: { id: string }; state: string; winning: boolean }[];
    expect(list).toMatchObject([{ slot: { id: slot.id }, state: "CURRENT", winning: true }]);

    const patched = await call("PATCH", `/homepage-slots/${slot.id}`, cookie, { listingIds: [b.id, a.id], title: "Monsoon layers v2", reason: "Reordered" });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { listingIds: string[] }).listingIds).toEqual([b.id, a.id]);

    expect((await call("DELETE", `/homepage-slots/${slot.id}`, cookie, { reason: "Edit ended early" })).status).toBe(200);
    expect(await db.select().from(homepageSlots)).toHaveLength(0);

    const audit = await db.select().from(auditEvents);
    expect(audit.map((e) => [e.action, e.reason, e.actorId])).toEqual(
      expect.arrayContaining([
        ["homepage_slot.created", "Weekly edit", user.id],
        ["homepage_slot.updated", "Reordered", user.id],
        ["homepage_slot.deleted", "Edit ended early", user.id],
      ]),
    );
  });

  it("requires a reason on every write (400)", async () => {
    const { cookie } = await staff("ADMIN");
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    expect((await call("POST", "/homepage-slots", cookie, { kind: "GRAILS", listingIds: [l.id] })).status).toBe(400);
    expect((await call("POST", "/homepage-slots", cookie, { kind: "GRAILS", listingIds: [l.id], reason: "no" })).status).toBe(400);
    const ok = (await (await call("POST", "/homepage-slots", cookie, { kind: "GRAILS", listingIds: [l.id], reason: "Good reason" })).json()) as { id: string };
    expect((await call("PATCH", `/homepage-slots/${ok.id}`, cookie, { listingIds: [l.id] })).status).toBe(400);
    expect((await call("PATCH", `/homepage-slots/${ok.id}`, cookie, { listingIds: [l.id], reason: "" })).status).toBe(400);
    expect((await call("DELETE", `/homepage-slots/${ok.id}`, cookie, { reason: "" })).status).toBe(400);
    expect(await db.select().from(homepageSlots)).toHaveLength(1);
  });

  it("validates: unknown or not-live listings 409, bad shapes 400, unapproved store 409, unknown slot 404", async () => {
    const { cookie } = await staff("ADMIN");
    const { seller } = await createSeller(db);
    const { seller: pending } = await createSeller(db, { status: "APPLIED" });
    const draft = await createListing(db, seller.id, { status: "DRAFT", publishedAt: null });
    const missing = "00000000-0000-4000-8000-000000000000";

    const notLive = await call("POST", "/homepage-slots", cookie, { kind: "GRAILS", listingIds: [draft.id, missing], reason: "Should fail" });
    expect(notLive.status).toBe(409);
    expect(await notLive.json()).toEqual({ error: "LISTINGS_NOT_LIVE", details: { listingIds: [draft.id, missing] } });

    expect((await call("POST", "/homepage-slots", cookie, { kind: "EDIT", title: "ab", listingIds: [missing], reason: "Short title" })).status).toBe(400);
    expect((await call("POST", "/homepage-slots", cookie, { kind: "GRAILS", listingIds: ["not-a-uuid"], reason: "Bad ids" })).status).toBe(400);
    expect((await call("POST", "/homepage-slots", cookie, { kind: "NOPE", reason: "Bad kind" })).status).toBe(400);
    expect((await call("POST", "/homepage-slots", cookie, { kind: "FEATURED_STORE", sellerId: pending.id, reason: "Not approved" })).status).toBe(409);
    expect((await call("POST", "/homepage-slots", cookie, { kind: "FEATURED_STORE", sellerId: seller.id, startsAt: "2026-10-10T00:00:00Z", endsAt: "2026-10-09T00:00:00Z", reason: "Backwards" })).status).toBe(400);
    expect((await call("PATCH", `/homepage-slots/${missing}`, cookie, { reason: "No such slot" })).status).toBe(404);
    expect((await call("DELETE", `/homepage-slots/${missing}`, cookie, { reason: "No such slot" })).status).toBe(404);
    expect(await db.select().from(homepageSlots)).toHaveLength(0);
  });

  it("an expired window shows as EXPIRED in the list and nothing is current", async () => {
    const { cookie } = await staff("ADMIN");
    const { seller } = await createSeller(db);
    const r = await call("POST", "/homepage-slots", cookie, { kind: "FEATURED_STORE", sellerId: seller.id, startsAt: "2020-01-01T00:00:00Z", endsAt: "2020-02-01T00:00:00Z", reason: "Old promo" });
    expect(r.status).toBe(201);
    expect(await (await call("GET", "/homepage-slots", cookie)).json()).toMatchObject([{ state: "EXPIRED", winning: false }]);
  });
});

describe("applications over HTTP", () => {
  async function apply(phone: string, handle: string) {
    return app.request("/api/seller-applications", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `7.7.7.${phone.slice(-2)}` },
      body: JSON.stringify({ storeName: "Shop", instagramHandle: handle, city: "Pune", whatTheySell: "Vintage denim", piecesPerMonth: "UNDER_20", phone }),
    });
  }

  it("lists with a status filter and changes status with a reason, a note and an audit event", async () => {
    const { cookie, user } = await staff("ADMIN");
    const a = (await (await apply("9811100001", "shop.one")).json()) as { id: string };
    const b = (await (await apply("9811100002", "shop.two")).json()) as { id: string };

    expect(((await (await call("GET", "/applications", cookie)).json()) as unknown[]).length).toBe(2);
    expect((await call("GET", "/applications?status=BOGUS", cookie)).status).toBe(400);

    expect((await call("POST", `/applications/${a.id}/status`, cookie, { status: "CONTACTED", reason: "" })).status).toBe(400);
    const moved = await call("POST", `/applications/${a.id}/status`, cookie, { status: "CONTACTED", note: "Called, will onboard Friday", reason: "Spoke on the phone" });
    expect(moved.status).toBe(200);
    expect(await moved.json()).toMatchObject({ status: "CONTACTED", adminNote: "Called, will onboard Friday" });

    const filtered = (await (await call("GET", "/applications?status=NEW", cookie)).json()) as { application: { id: string } }[];
    expect(filtered.map((r) => r.application.id)).toEqual([b.id]);

    expect((await call("POST", `/applications/${a.id}/status`, cookie, { status: "CONTACTED", reason: "Same again" })).status).toBe(409);
    expect((await call("POST", `/applications/00000000-0000-4000-8000-000000000000/status`, cookie, { status: "REJECTED", reason: "No such one" })).status).toBe(404);
    const [audit] = await db.select().from(auditEvents);
    expect(audit).toMatchObject({ action: "seller_application.status_changed", actorId: user.id, reason: "Spoke on the phone" });
    expect(await db.select().from(sellerApplications)).toHaveLength(2);
  });
});
