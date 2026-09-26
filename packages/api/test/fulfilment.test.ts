import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orders } from "@yolt/db";
import { DevShippingProvider } from "../src";
import { createSeller, paidOrder, testDb, truncateAll } from "../../core/test/fixtures";
import { makeApp, sessionCookie } from "./helpers";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));

const shipping = new DevShippingProvider("test-shipping-secret");
const { app } = makeApp(db, { shipping });

async function as(userId: string) {
  return { cookie: await sessionCookie(db, userId), "content-type": "application/json" };
}
const req = async (method: string, path: string, userId: string | null, body?: unknown) =>
  app.request(path, {
    method,
    headers: userId ? await as(userId) : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const statusOf = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0]!.status;

describe("seller ships, buyer tracks", () => {
  it("to-ship → book pickup → label → scans → delivered, visible to the buyer", async () => {
    const p = await paidOrder(db);

    const list = (await (await req("GET", "/api/seller/orders", p.owner.id)).json()) as { counts: Record<string, number>; items: { id: string }[] };
    expect(list.counts["to-ship"]).toBe(1);
    expect(list.items[0]!.id).toBe(p.orderId);

    const shipped = await req("POST", `/api/seller/orders/${p.orderId}/ship`, p.owner.id);
    expect(shipped.status).toBe(200);
    const { awb, labelUrl } = (await shipped.json()) as { awb: string; labelUrl: string };
    expect(awb).toMatch(/^DEV/);
    expect(await statusOf(p.orderId)).toBe("PACKED");

    const label = await req("GET", labelUrl, p.owner.id);
    expect(await label.text()).toContain("411001");

    expect((await req("POST", `/api/seller/orders/${p.orderId}/ship`, p.owner.id)).status).toBe(409); // no double booking

    for (const expected of ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"]) {
      const r = await req("POST", `/api/dev/shipments/${awb}/advance`, null, {});
      expect(await r.json()).toMatchObject({ result: "APPLIED", shipmentStatus: expected });
    }
    expect(await statusOf(p.orderId)).toBe("DELIVERED");

    const tracking = (await (await req("GET", `/api/orders/${p.orderId}/tracking`, p.buyer.id)).json()) as { events: { status: string }[] };
    expect(tracking.events.map((e) => e.status)).toEqual(["BOOKED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"]);
    const mine = (await (await req("GET", "/api/orders", p.buyer.id)).json()) as { id: string }[];
    expect(mine.map((o) => o.id)).toEqual([p.orderId]);
  });

  it("tracking webhooks must be signed", async () => {
    const p = await paidOrder(db);
    const { awb } = (await (await req("POST", `/api/seller/orders/${p.orderId}/ship`, p.owner.id)).json()) as { awb: string };
    const forged = await app.request("/api/webhooks/shipping/dev", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dev-shipping-signature": "0".repeat(64) },
      body: JSON.stringify({ eventId: "x", awb, status: "DELIVERED", occurredAt: new Date().toISOString() }),
    });
    expect(forged.status).toBe(401);
    expect(await statusOf(p.orderId)).toBe("PACKED");

    const real = shipping.buildTrackingWebhook(awb, "PICKED_UP");
    const ok = await app.request("/api/webhooks/shipping/dev", { method: "POST", headers: Object.fromEntries(real.headers), body: await real.text() });
    expect(await ok.json()).toMatchObject({ result: "APPLIED" });
  });

  it("seller cancel refunds; buyer late-cancel waits for the deadline", async () => {
    const p = await paidOrder(db);
    expect((await req("POST", `/api/orders/${p.orderId}/cancel-late`, p.buyer.id)).status).toBe(409);
    expect((await req("POST", `/api/seller/orders/${p.orderId}/cancel`, p.owner.id, { reason: "" })).status).toBe(400);
    const r = await req("POST", `/api/seller/orders/${p.orderId}/cancel`, p.owner.id, { reason: "Found a tear while packing" });
    expect(await r.json()).toMatchObject({ ok: true, refundId: expect.any(String) });
    expect(await statusOf(p.orderId)).toBe("CANCELLED_BY_SELLER");
  });

  it("orders are private to their seller and buyer", async () => {
    const p = await paidOrder(db);
    const { owner: otherSeller } = await createSeller(db);
    expect((await req("GET", `/api/seller/orders/${p.orderId}`, otherSeller.id)).status).toBe(404);
    expect((await req("POST", `/api/seller/orders/${p.orderId}/ship`, otherSeller.id)).status).toBe(404);
    expect((await req("GET", `/api/orders/${p.orderId}/tracking`, otherSeller.id)).status).toBe(404);
    // A buyer isn't a seller: the seller middleware applies to order routes too.
    expect((await req("GET", "/api/seller/orders", p.buyer.id)).status).toBe(403);
  });

  it("close-delivered cron needs the secret", async () => {
    expect((await app.request("/api/cron/close-delivered")).status).toBe(401);
    const ok = await app.request("/api/cron/close-delivered", { headers: { authorization: "Bearer cron" } });
    expect(await ok.json()).toEqual({ closed: 0 });
  });
});
