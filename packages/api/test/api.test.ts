import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { listings } from "@yolt/db";
import { createApp, DEV_USER_COOKIE, SandboxPaymentProvider } from "../src";
import { createListing, createSeller, createUser, testDb, truncateAll } from "../../core/test/fixtures";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));

const sandbox = new SandboxPaymentProvider("test-secret");
const app = createApp({ db, payments: sandbox, sandbox, allowDevAuth: true, cronSecret: "cron" });

const as = (userId: string) => ({ cookie: `${DEV_USER_COOKIE}=${userId}`, "content-type": "application/json" });
const post = (path: string, userId: string | null, body?: unknown) =>
  app.request(path, {
    method: "POST",
    headers: userId ? as(userId) : { "content-type": "application/json" },
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

    const pay = await post(`/api/orders/${orderId}/pay`, buyer.id);
    expect(pay.status).toBe(200);
    const { providerOrderId } = (await pay.json()) as { providerOrderId: string };

    const done = await post("/api/dev/sandbox/complete", buyer.id, { providerOrderId, outcome: "success" });
    expect(await done.json()).toMatchObject({ status: "CONFIRMED" });

    const order = await app.request(`/api/orders/${orderId}`, { headers: as(buyer.id) });
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
    expect((await app.request(`/api/orders/${orderId}`, { headers: as(b.id) })).status).toBe(404);
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
    const prod = createApp({ db, payments: sandbox, allowDevAuth: false });
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
