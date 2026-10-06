import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSlot } from "@yolt/core";
import { outboxEvents, sellerApplications } from "@yolt/db";
import { createListing, createSeller, createUser, testDb, truncateAll } from "../../core/test/fixtures";
import { makeApp, sessionCookie } from "./helpers";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));
const { app } = makeApp(db);

describe("GET /api/home", () => {
  it("is public and returns every section, empty on an empty marketplace", async () => {
    const res = await app.request("/api/home");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age");
    expect(await res.json()).toEqual({ trending: { mode: "JUST_DROPPED", items: [] }, justSold: [], grails: [], featuredStore: null, edit: null });
  });

  it("returns cards in the existing listing-card shape, plus curated sections", async () => {
    const { seller } = await createSeller(db, { handle: "secondloop" });
    const l = await createListing(db, seller.id, { title: "Carhartt jacket" });
    const admin = await createUser(db);
    await createSlot(db, { adminUserId: admin.id, kind: "GRAILS", listingIds: [l.id], reason: "Grails of the week" });
    await createSlot(db, { adminUserId: admin.id, kind: "EDIT", title: "Workwear edit", listingIds: [l.id], reason: "Weekly edit" });

    const body = (await (await app.request("/api/home")).json()) as Record<string, any>;
    expect(body.trending.items[0]).toMatchObject({ id: l.id, slug: l.slug, title: "Carhartt jacket", sellerHandle: "secondloop", pricePaise: 129900, status: "AVAILABLE" });
    expect(body.grails.map((g: { id: string }) => g.id)).toEqual([l.id]);
    expect(body.edit).toMatchObject({ title: "Workwear edit" });
    expect(body.featuredStore).toMatchObject({ handle: "secondloop", source: "MOST_STOCKED", inStockCount: 1 });
  });
});

describe("POST /api/seller-applications", () => {
  const form = (o: Record<string, unknown> = {}) => ({
    storeName: "Retro Rack",
    instagramHandle: "@retro.rack",
    city: "Bengaluru",
    whatTheySell: "90s sportswear and denim",
    piecesPerMonth: "BETWEEN_20_50",
    phone: "98111 22233",
    ...o,
  });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request("/api/seller-applications", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "1.1.1.1", ...headers }, body: JSON.stringify(body) });

  it("works for guests: 201 for a new application, an outbox event, and no phone in the response", async () => {
    const res = await post(form());
    expect(res.status).toBe(201);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toMatchObject({ status: "NEW", existing: false });
    expect(JSON.stringify(json)).not.toContain("9811122233");
    expect(await db.select().from(outboxEvents)).toHaveLength(1);
  });

  it("links a signed-in applicant", async () => {
    const u = await createUser(db);
    await post(form(), { cookie: await sessionCookie(db, u.id) });
    expect((await db.select().from(sellerApplications))[0]!.userId).toBe(u.id);
  });

  it("a duplicate returns 200 with the existing application", async () => {
    const first = (await (await post(form())).json()) as { id: string };
    const again = await post(form({ instagramHandle: "different.handle" }), { "x-forwarded-for": "2.2.2.2" });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ id: first.id, existing: true });
    expect(await db.select().from(sellerApplications)).toHaveLength(1);
  });

  it("validates input with 400s", async () => {
    expect((await post(form({ phone: "12345" }))).status).toBe(400);
    expect((await post(form({ piecesPerMonth: "LOTS" }))).status).toBe(400);
    expect((await post(form({ instagramHandle: "no spaces allowed" }))).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });

  it("rate limits per network and per phone with 429 and Retry-After", async () => {
    for (let i = 0; i < 5; i++) expect((await post(form({ phone: `981110000${i}`, instagramHandle: `shop${i}` }))).status).toBe(201);
    const byIp = await post(form({ phone: "9811100009", instagramHandle: "shop9" }));
    expect(byIp.status).toBe(429);
    expect(Number(byIp.headers.get("retry-after"))).toBeGreaterThan(0);

    for (let i = 0; i < 3; i++) await post(form({ phone: "9822200000", instagramHandle: "samephone" }), { "x-forwarded-for": `3.3.3.${i}` });
    expect((await post(form({ phone: "9822200000", instagramHandle: "samephone" }), { "x-forwarded-for": "3.3.3.9" })).status).toBe(429);
  });

  it("rejects cross-site posts", async () => {
    expect((await post(form(), { origin: "https://evil.example" })).status).toBe(403);
  });
});
