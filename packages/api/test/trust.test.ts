import { afterAll, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { getReviewableItems } from "@yolt/core";
import { claims, refunds } from "@yolt/db";
import { MemoryMediaStorage } from "../src";
import { createUser, deliveredOrder, testDb, truncateAll } from "../../core/test/fixtures";
import { makeApp, sessionCookie } from "./helpers";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));

const media = new MemoryMediaStorage();
const { app } = makeApp(db, { media });

const cookieFor = (id: string) => sessionCookie(db, id);
const post = async (path: string, userId: string, body: unknown) =>
  app.request(path, { method: "POST", headers: { cookie: await cookieFor(userId), "content-type": "application/json" }, body: JSON.stringify(body) });

async function uploadEvidence(userId: string) {
  const jpeg = await sharp({ create: { width: 800, height: 800, channels: 3, background: "#aa6644" } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "18/1 31/1 0/1" } })
    .toBuffer();
  const form = new FormData();
  form.set("file", new File([new Uint8Array(jpeg)], "stain.jpg", { type: "image/jpeg" }));
  const res = await app.request("/api/uploads/evidence", { method: "POST", headers: { cookie: await cookieFor(userId) }, body: form });
  return { res, url: ((await res.json()) as { url: string }).url };
}

describe("protection claims over HTTP", () => {
  it("upload evidence (GPS stripped) → claim → seller accepts → refund", async () => {
    const p = await deliveredOrder(db);
    const { res, url } = await uploadEvidence(p.buyer.id);
    expect(res.status).toBe(201);
    const stored = [...media.objects.entries()].find(([k]) => url.endsWith(k))![1];
    expect((await sharp(stored.body).metadata()).exif).toBeUndefined();

    const c = await post(`/api/orders/${p.orderId}/claim`, p.buyer.id, { reason: "NOT_AS_DESCRIBED", description: "Large stain on the back, not in photos", photoUrls: [url] });
    expect(c.status).toBe(201);
    const { claimId } = (await c.json()) as { claimId: string };

    const open = (await (await app.request("/api/seller/claims", { headers: { cookie: await cookieFor(p.owner.id) } })).json()) as unknown[];
    expect(open).toHaveLength(1);
    const accepted = await post(`/api/seller/claims/${claimId}/respond`, p.owner.id, { action: "ACCEPT", response: "Sorry about that" });
    expect(await accepted.json()).toMatchObject({ ok: true, refundId: expect.any(String) });
    expect(await db.select().from(refunds)).toHaveLength(1);
  });

  it("rejects photo links that weren't uploaded by this buyer", async () => {
    const p = await deliveredOrder(db);
    const other = await createUser(db);
    const { url: othersPhoto } = await uploadEvidence(other.id);
    for (const photoUrls of [["https://evil.example/fake.jpg"], [othersPhoto]]) {
      const r = await post(`/api/orders/${p.orderId}/claim`, p.buyer.id, { reason: "DAMAGED", description: "Torn at the seam badly", photoUrls });
      expect(r.status).toBe(400);
    }
    expect(await db.select().from(claims)).toHaveLength(0);
  });

  it("a dispute must explain the seller's side", async () => {
    const p = await deliveredOrder(db);
    const { url } = await uploadEvidence(p.buyer.id);
    const { claimId } = (await (await post(`/api/orders/${p.orderId}/claim`, p.buyer.id, { reason: "WRONG_ITEM", description: "This is a different jacket", photoUrls: [url] })).json()) as { claimId: string };
    expect((await post(`/api/seller/claims/${claimId}/respond`, p.owner.id, { action: "DISPUTE", response: "no" })).status).toBe(400);
    expect((await post(`/api/seller/claims/${claimId}/respond`, p.owner.id, { action: "DISPUTE", response: "Tag in photo 3 matches the listing" })).status).toBe(200);
    const [c] = await db.select().from(claims).where(eq(claims.id, claimId));
    expect(c!.status).toBe("ESCALATED");
  });

  it("needs sign-in", async () => {
    const p = await deliveredOrder(db);
    const r = await app.request(`/api/orders/${p.orderId}/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "DAMAGED", description: "xxxxxxxxxxxx" }) });
    expect(r.status).toBe(401);
  });
});

describe("reviews over HTTP", () => {
  it("review with a photo, then one seller reply", async () => {
    const p = await deliveredOrder(db);
    const [item] = await getReviewableItems(db, { buyerId: p.buyer.id, orderId: p.orderId });
    const { url } = await uploadEvidence(p.buyer.id);
    const r = await post("/api/reviews", p.buyer.id, { orderItemId: item!.id, rating: 5, accuracyRating: 5, body: "Exactly as described", photoUrls: [url] });
    expect(r.status).toBe(201);
    const { reviewId } = (await r.json()) as { reviewId: string };
    expect((await post("/api/reviews", p.buyer.id, { orderItemId: item!.id, rating: 1 })).status).toBe(409);
    expect((await post(`/api/seller/reviews/${reviewId}/reply`, p.owner.id, { reply: "Thank you!" })).status).toBe(200);
    expect((await post(`/api/seller/reviews/${reviewId}/reply`, p.owner.id, { reply: "Again" })).status).toBe(409);
  });
});
