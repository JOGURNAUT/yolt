import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { listings } from "@yolt/db";
import { UnconfiguredShippingProvider } from "../src";
import { makeApp, sessionCookie } from "./helpers";
import { createListing, createSeller, createUser, testDb, truncateAll } from "../../core/test/fixtures";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));

const { app, sandbox } = makeApp(db);

const as = async (userId: string) => ({ cookie: await sessionCookie(db, userId), "content-type": "application/json" });
const post = async (path: string, userId: string | null, body?: unknown) =>
  app.request(path, {
    method: "POST",
    headers: userId ? await as(userId) : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("buy flow over HTTP", () => {
  it("checkout → pay → signed webhook → sold", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const buyer = await createUser(db);

    const checkout = await post("/api/checkout", buyer.id, { listingIds: [l.id], expectedSubtotalPaise: l.pricePaise });
    expect(checkout.status).toBe(201);
    const { orderId } = (await checkout.json()) as { orderId: string };

    // Paying before choosing an address is refused.
    expect((await post(`/api/orders/${orderId}/pay`, buyer.id)).status).toBe(409);
    const address = await post("/api/addresses", buyer.id, {
      name: "Ananya Sharma",
      phone: "9876543210",
      line1: "Flat 12, Sunrise Apartments",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411001",
    });
    const { id: addressId } = (await address.json()) as { id: string };
    const chosen = await post(`/api/orders/${orderId}/address`, buyer.id, { addressId });
    expect(await chosen.json()).toEqual({ etaDaysMin: 2, etaDaysMax: 3 });

    const pay = await post(`/api/orders/${orderId}/pay`, buyer.id);
    expect(pay.status).toBe(200);
    const { providerOrderId } = (await pay.json()) as { providerOrderId: string };

    const done = await post("/api/dev/sandbox/complete", buyer.id, { providerOrderId, outcome: "success" });
    expect(await done.json()).toMatchObject({ status: "CONFIRMED" });

    const order = await app.request(`/api/orders/${orderId}`, { headers: await as(buyer.id) });
    expect(await order.json()).toMatchObject({ status: "CONFIRMED", payment: "SUCCEEDED" });
    const [after] = await db.select().from(listings).where(eq(listings.id, l.id));
    expect(after!.status).toBe("SOLD");
  });

  it("requires sign-in and validates input", async () => {
    expect((await post("/api/checkout", null, { listingIds: [crypto.randomUUID()] })).status).toBe(401);
    const buyer = await createUser(db);
    expect((await post("/api/checkout", buyer.id, { listingIds: ["not-a-uuid"] })).status).toBe(400);
  });

  it("returns 409 with the unavailable ids when someone else holds the item", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const [a, b] = [await createUser(db), await createUser(db)];
    await post("/api/checkout", a.id, { listingIds: [l.id] });
    const r = await post("/api/checkout", b.id, { listingIds: [l.id] });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "UNAVAILABLE", details: { unavailableListingIds: [l.id] } });
  });

  it("buyers cannot read someone else's order", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const [a, b] = [await createUser(db), await createUser(db)];
    const { orderId } = (await (await post("/api/checkout", a.id, { listingIds: [l.id] })).json()) as { orderId: string };
    expect((await app.request(`/api/orders/${orderId}`, { headers: await as(b.id) })).status).toBe(404);
  });

  it("rejects webhooks with a bad signature", async () => {
    const req = sandbox.buildWebhook({ type: "payment.succeeded", providerOrderId: "x", amountPaise: 1, currency: "INR" });
    const tampered = new Request(req, { body: (await req.text()).replace('"amountPaise":1', '"amountPaise":999') });
    const r = await app.request("/api/webhooks/sandbox", {
      method: "POST",
      headers: { "content-type": "application/json", "x-sandbox-signature": req.headers.get("x-sandbox-signature")! },
      body: await tampered.text(),
    });
    expect(r.status).toBe(401);
  });

  it("cron endpoint needs the secret", async () => {
    expect((await app.request("/api/cron/expire-holds")).status).toBe(401);
    const ok = await app.request("/api/cron/expire-holds", { headers: { authorization: "Bearer cron" } });
    expect(await ok.json()).toEqual({ expired: 0 });
  });

  it("dev routes don't exist when dev auth is off", async () => {
    const { app: prod } = makeApp(db, { devLogin: false, sandboxTools: false, exposeOtpCodes: false, sandbox: undefined });
    const r = await prod.request("/api/dev/login", { method: "POST", body: "{}" });
    expect(r.status).toBe(404);
  });

  it("only the item's own seller can mark it sold elsewhere", async () => {
    const { seller, owner } = await createSeller(db);
    const { owner: otherOwner } = await createSeller(db);
    const l = await createListing(db, seller.id);
    expect((await post(`/api/seller/listings/${l.id}/sold-elsewhere`, otherOwner.id)).status).toBe(404);
    expect((await post(`/api/seller/listings/${l.id}/sold-elsewhere`, owner.id)).status).toBe(200);
  });
});

describe("addresses and delivery checks", () => {
  const addr = { name: "Ananya Sharma", phone: "9876543210", line1: "Flat 12, Sunrise Apartments", city: "Pune", state: "Maharashtra" };

  it("public delivery check by pincode", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const near = await app.request(`/api/shipping/check?listingId=${l.id}&pincode=411014`);
    expect(await near.json()).toMatchObject({ serviceable: true, etaDaysMin: 2, etaDaysMax: 3 });
    const far = await app.request(`/api/shipping/check?listingId=${l.id}&pincode=110001`);
    expect(await far.json()).toMatchObject({ serviceable: true, etaDaysMin: 5 });
    const none = await app.request(`/api/shipping/check?listingId=${l.id}&pincode=990001`);
    expect(await none.json()).toMatchObject({ serviceable: false, reason: "PINCODE_NOT_SERVICEABLE" });
    expect((await app.request(`/api/shipping/check?listingId=${l.id}&pincode=12`)).status).toBe(400);
  });

  it("refuses an address couriers can't reach, and leaves the order without one", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const buyer = await createUser(db);
    const { orderId } = (await (await post("/api/checkout", buyer.id, { listingIds: [l.id] })).json()) as { orderId: string };
    const { id } = (await (await post("/api/addresses", buyer.id, { ...addr, pincode: "990001" })).json()) as { id: string };
    const r = await post(`/api/orders/${orderId}/address`, buyer.id, { addressId: id });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "NOT_SERVICEABLE" });
    expect((await post(`/api/orders/${orderId}/pay`, buyer.id)).status).toBe(409);
  });

  it("a buyer can't use someone else's address or see their book", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const [a, b] = [await createUser(db), await createUser(db)];
    const { id } = (await (await post("/api/addresses", a.id, { ...addr, pincode: "411001" })).json()) as { id: string };
    const { orderId } = (await (await post("/api/checkout", b.id, { listingIds: [l.id] })).json()) as { orderId: string };
    expect((await post(`/api/orders/${orderId}/address`, b.id, { addressId: id })).status).toBe(404);
    const book = await app.request("/api/addresses", { headers: await as(b.id) });
    expect(await book.json()).toEqual([]);
  });

  it("address validation errors come back per field", async () => {
    const buyer = await createUser(db);
    const r = await post("/api/addresses", buyer.id, { ...addr, pincode: "12345", state: "Atlantis" });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { details: { errors: { field: string }[] } };
    expect(body.details.errors.map((e) => e.field).sort()).toEqual(["pincode", "state"]);
  });

  it("address endpoints need sign-in", async () => {
    expect((await app.request("/api/addresses")).status).toBe(401);
  });
});

describe("without a shipping provider", () => {
  it("answers 503 instead of guessing", async () => {
    const { app: prodLike } = makeApp(db, { shipping: new UnconfiguredShippingProvider() });
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    expect((await prodLike.request(`/api/shipping/check?listingId=${l.id}&pincode=411001`)).status).toBe(503);
  });
});

describe("address changes during payment", () => {
  it("are refused with PAYMENT_IN_PROGRESS, even for a deliverable address", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id);
    const buyer = await createUser(db);
    const addr = { name: "Ananya Sharma", phone: "9876543210", line1: "Flat 12, Sunrise Apartments", city: "Pune", state: "Maharashtra" };
    const { orderId } = (await (await post("/api/checkout", buyer.id, { listingIds: [l.id] })).json()) as { orderId: string };
    const a = (await (await post("/api/addresses", buyer.id, { ...addr, pincode: "411001" })).json()) as { id: string };
    const b = (await (await post("/api/addresses", buyer.id, { ...addr, pincode: "411014" })).json()) as { id: string };
    await post(`/api/orders/${orderId}/address`, buyer.id, { addressId: a.id });
    await post(`/api/orders/${orderId}/pay`, buyer.id);
    const r = await post(`/api/orders/${orderId}/address`, buyer.id, { addressId: b.id });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "PAYMENT_IN_PROGRESS" });
  });
});

describe("search API", () => {
  it("returns hits and pill counts, and tolerates junk params", async () => {
    const { seller } = await createSeller(db);
    await createListing(db, seller.id, { title: "Vintage Levi's 501", category: "jeans" });
    const r = await app.request("/api/search?q=levis&cat=spaceships&page=-3&sort=hack");
    expect(r.status).toBe(200);
    const body = (await r.json()) as { hits: { title: string }[]; stockCounts: Record<string, number>; mode: string };
    expect(body.hits.map((h) => h.title)).toEqual(["Vintage Levi's 501"]);
    expect(body.stockCounts["in-stock"]).toBe(1);
    expect(body.mode).toBe("exact");
  });
});

describe("staging mode", () => {
  it("keeps sandbox tools for demos but never one-click login", async () => {
    const { app: staging } = makeApp(db, { devLogin: false, sandboxTools: true, exposeOtpCodes: true });
    const u = await createUser(db);
    const login = await staging.request("/api/dev/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: u.id }) });
    expect(login.status).toBe(404);
    const sandbox = await staging.request("/api/dev/sandbox/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ providerOrderId: "none", outcome: "success" }) });
    expect(sandbox.status).toBe(404); // route exists, attempt doesn't
    expect(await sandbox.json()).toEqual({ error: "NOT_FOUND" });
  });
});

describe("saves, follows and bag over HTTP", () => {
  it("guest items merge at sign-in; bag groups by store; routes need sign-in", async () => {
    const { seller } = await createSeller(db);
    const [a, b] = [await createListing(db, seller.id), await createListing(db, seller.id)];
    const buyer = await createUser(db);
    expect((await app.request("/api/bag")).status).toBe(401);
    expect(await (await post("/api/saves/merge", buyer.id, { listingIds: [a.id, b.id, "junk"] })).json()).toEqual({ merged: 2 });
    expect(await (await post("/api/bag/merge", buyer.id, { listingIds: [a.id] })).json()).toEqual({ merged: 1 });
    expect((await post("/api/bag", buyer.id, { listingId: b.id })).status).toBe(200);
    const bag = (await (await app.request("/api/bag", { headers: await as(buyer.id) })).json()) as { items: unknown[] }[];
    expect(bag).toHaveLength(1);
    expect(bag[0]!.items).toHaveLength(2);
    expect((await post("/api/follows", buyer.id, { sellerId: seller.id })).status).toBe(200);
  });

  it("the new prefixes don't leak sign-in onto public routes", async () => {
    expect((await app.request("/api/search")).status).toBe(200);
    expect((await app.request("/api/cron/expire-holds", { headers: { authorization: "Bearer cron" } })).status).toBe(200);
  });
});
