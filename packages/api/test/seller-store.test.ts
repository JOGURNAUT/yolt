import { afterAll, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { orders } from "@yolt/db";
import { MemoryMediaStorage } from "../src";
import { createSeller, createUser, testDb, truncateAll } from "../../core/test/fixtures";
import { makeApp, sessionCookie } from "./helpers";

const { db, close } = testDb(10);
afterAll(close);
const media = new MemoryMediaStorage();
beforeEach(async () => {
  await truncateAll(db);
  media.objects.clear();
});
const { app } = makeApp(db, { media });

const call = async (method: string, path: string, userId: string | null, body?: unknown) =>
  app.request(`/api/seller${path}`, {
    method,
    headers: { ...(userId ? { cookie: await sessionCookie(db, userId) } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const PICKUP = { name: "Second Loop", phone: "9876543210", line1: "12 MG Road, Camp", city: "Pune", state: "Maharashtra", pincode: "411001" };

async function image(width: number, height: number, withGps = true) {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 20, g: 120, b: 200 } } }).jpeg();
  if (withGps) img = img.withExif({ IFD0: { Make: "PhoneCo" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "18/1 31/1 0/1" } });
  return img.toBuffer();
}
async function upload(userId: string, which: "logo" | "banner", file: Buffer) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(file)], "x.jpg", { type: "image/jpeg" }));
  return app.request(`/api/seller/store/${which}`, { method: "POST", headers: { cookie: await sessionCookie(db, userId) }, body: form });
}

describe("access", () => {
  it("needs sign-in and an approved seller profile", async () => {
    const buyer = await createUser(db);
    const { owner: pending } = await createSeller(db, { status: "APPLIED" });
    for (const [m, p] of [["GET", "/store"], ["PATCH", "/store"], ["GET", "/payouts"], ["DELETE", "/store/logo"]] as const) {
      expect((await call(m, p, null, m === "PATCH" ? {} : undefined)).status, `${m} ${p} signed out`).toBe(401);
      expect((await call(m, p, buyer.id, m === "PATCH" ? {} : undefined)).status, `${m} ${p} buyer`).toBe(403);
      expect((await call(m, p, pending.id, m === "PATCH" ? {} : undefined)).status, `${m} ${p} pending`).toBe(403);
    }
    expect((await app.request("/api/seller/store/logo", { method: "POST" })).status).toBe(401);
  });
});

describe("GET and PATCH /api/seller/store", () => {
  it("returns the seller's own store settings", async () => {
    const { owner } = await createSeller(db, { instagramHandle: "second.loop", instagramVerifiedAt: new Date(), bio: "Hi" });
    expect(await (await call("GET", "/store", owner.id)).json()).toMatchObject({
      instagramHandle: "second.loop",
      instagramVerified: true,
      bio: "Hi",
      dispatchDays: 2,
      pickup: { pincode: "411001" },
    });
  });

  it("saves bio, dispatch, shipping and pickup", async () => {
    const { owner } = await createSeller(db);
    const res = await call("PATCH", "/store", owner.id, { bio: "Hand-picked vintage", dispatchDays: 1, shippingFeePaise: 6900, freeShippingAbovePaise: 149900, pickup: PICKUP });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ bio: "Hand-picked vintage", dispatchDays: 1, shippingFeePaise: 6900, pickup: { phone: "+919876543210", city: "Pune" } });
    expect(await (await call("GET", "/store", owner.id)).json()).toMatchObject({ dispatchDays: 1, freeShippingAbovePaise: 149900 });
  });

  it("returns 400 with every bad field, and read-only fields can't be sent at all", async () => {
    const { owner } = await createSeller(db, { instagramHandle: "second.loop" });
    const bad = await call("PATCH", "/store", owner.id, { bio: "x".repeat(161), dispatchDays: 5, shippingFeePaise: -1, pickup: { ...PICKUP, pincode: "12" } });
    expect(bad.status).toBe(400);
    const { details } = (await bad.json()) as { details: { errors: { field: string }[] } };
    expect(details.errors.map((e) => e.field).sort()).toEqual(["bio", "dispatchDays", "pickup.pincode", "shippingFeePaise"]);

    for (const field of [{ instagramHandle: "evil" }, { instagramVerifiedAt: "2020-01-01" }, { handle: "x" }, { kycStatus: "VERIFIED" }, { displayName: "Renamed" }, { sellerId: "x" }]) {
      expect((await call("PATCH", "/store", owner.id, field)).status, JSON.stringify(field)).toBe(400);
    }
    expect(await (await call("GET", "/store", owner.id)).json()).toMatchObject({ instagramHandle: "second.loop", kycStatus: "VERIFIED" });
  });

  it("each seller only ever edits their own store", async () => {
    const { owner: a } = await createSeller(db, { displayName: "A" });
    const { owner: b } = await createSeller(db, { displayName: "B" });
    await call("PATCH", "/store", a.id, { bio: "Only A" });
    expect(await (await call("GET", "/store", b.id)).json()).toMatchObject({ displayName: "B", bio: null });
  });
});

describe("logo and banner", () => {
  it("re-encodes to WebP at the slot's size and strips EXIF, then replaces and deletes the old object", async () => {
    const { owner } = await createSeller(db);
    const first = await upload(owner.id, "logo", await image(1500, 900));
    expect(first.status).toBe(201);
    const { url } = (await first.json()) as { url: string };
    const key = [...media.objects.keys()].find((k) => k.includes("/logo-"))!;
    expect(url).toBe(media.publicUrl(key));
    const stored = media.objects.get(key)!;
    const meta = await sharp(stored.body).metadata();
    expect([stored.contentType, meta.format, meta.width, meta.height, meta.exif]).toEqual(["image/webp", "webp", 512, 512, undefined]);

    const banner = await upload(owner.id, "banner", await image(2400, 1600));
    expect(banner.status).toBe(201);
    const bannerMeta = await sharp(media.objects.get([...media.objects.keys()].find((k) => k.includes("/banner-"))!)!.body).metadata();
    expect([bannerMeta.width, bannerMeta.height]).toEqual([1600, 600]);

    // Replacing the logo removes the previous object from storage.
    expect((await upload(owner.id, "logo", await image(800, 800))).status).toBe(201);
    expect(media.objects.has(key)).toBe(false);
    expect([...media.objects.keys()].filter((k) => k.includes("/logo-"))).toHaveLength(1);
    expect(await (await call("GET", "/store", owner.id)).json()).toMatchObject({ logoUrl: expect.stringContaining("/logo-"), bannerUrl: expect.stringContaining("/banner-") });
  });

  it("deleting clears the image and its object", async () => {
    const { owner } = await createSeller(db);
    await upload(owner.id, "banner", await image(1600, 600));
    expect((await call("DELETE", "/store/banner", owner.id)).status).toBe(200);
    expect([...media.objects.keys()].filter((k) => k.includes("/banner-"))).toHaveLength(0);
    expect(await (await call("GET", "/store", owner.id)).json()).toMatchObject({ bannerUrl: null });
  });

  it("rejects non-images, tiny images and missing files", async () => {
    const { owner } = await createSeller(db);
    expect((await upload(owner.id, "logo", Buffer.from("not an image"))).status).toBe(400);
    expect((await upload(owner.id, "logo", await image(100, 100))).status).toBe(400);
    expect((await upload(owner.id, "banner", await image(600, 600))).status).toBe(400); // banner needs 800 x 300
    const empty = await app.request("/api/seller/store/logo", { method: "POST", headers: { cookie: await sessionCookie(db, owner.id) }, body: new FormData() });
    expect(empty.status).toBe(400);
  });
});

describe("GET /api/seller/payouts", () => {
  it("returns balances and rows for this seller only, paginated", async () => {
    const { seller, owner } = await createSeller(db);
    const { seller: other } = await createSeller(db);
    const buyer = await createUser(db);
    const mk = (sellerId: string, i: number, status: "CLOSED" | "DELIVERED") =>
      db.insert(orders).values({ reference: `YL-T${sellerId.slice(0, 3)}${i}`, buyerId: buyer.id, sellerId, status, subtotalPaise: 100_000, shippingPaise: 0, totalPaise: 100_000, confirmedAt: new Date(Date.now() - i * 60_000) });
    for (let i = 0; i < 3; i++) await mk(seller.id, i, "CLOSED");
    await mk(seller.id, 3, "DELIVERED");
    await mk(other.id, 0, "CLOSED");

    const res = await call("GET", "/payouts?pageSize=3", owner.id);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { balances: Record<string, number>; rows: Record<string, unknown>[]; total: number; page: number };
    expect(json.balances).toEqual({ pendingPaise: 100_000, availablePaise: 300_000, paidOutPaise: 0 });
    expect(json.total).toBe(4);
    expect(json.rows).toHaveLength(3);
    expect(json.rows[0]).toMatchObject({ sourceLabel: "Found on YOLT", commissionPaise: 0, netPaise: 100_000, bucket: "AVAILABLE", date: expect.any(String) });

    const page2 = (await (await call("GET", "/payouts?pageSize=3&page=2", owner.id)).json()) as { rows: unknown[] };
    expect(page2.rows).toHaveLength(1);
    expect((await call("GET", "/payouts?page=0", owner.id)).status).toBe(400);
    expect((await call("GET", "/payouts?pageSize=500", owner.id)).status).toBe(400);
    await db.update(orders).set({ source: "SELLER_LINK" }).where(eq(orders.sellerId, seller.id));
    expect(((await (await call("GET", "/payouts", owner.id)).json()) as { rows: { sourceLabel: string }[] }).rows[0]!.sourceLabel).toBe("Your link");
  });
});
