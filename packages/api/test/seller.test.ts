import { afterAll, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { MemoryMediaStorage } from "../src";
import { makeApp, sessionCookie } from "./helpers";
import { createSeller, createUser, testDb, truncateAll } from "../../core/test/fixtures";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(async () => {
  await truncateAll(db);
  cookies.clear();
});

const media = new MemoryMediaStorage();
const { app } = makeApp(db, { media });

const cookies = new Map<string, string>();
const cookie = async (userId: string) => cookies.get(userId) ?? cookies.set(userId, await sessionCookie(db, userId)).get(userId)!;
const call = async (method: string, path: string, userId: string, body?: unknown) =>
  app.request(`/api/seller${path}`, {
    method,
    headers: { cookie: await cookie(userId), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** A real JPEG carrying GPS EXIF, like a phone photo taken at the seller's home. */
async function phonePhoto(width = 1200, height = 1500) {
  return sharp({ create: { width, height, channels: 3, background: { r: 180, g: 120, b: 90 } } })
    .jpeg()
    .withExif({ IFD0: { Make: "PhoneCo" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "18/1 31/1 0/1" } })
    .toBuffer();
}

async function upload(userId: string, listingId: string, kind: string, file?: Buffer) {
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", new File([new Uint8Array(file ?? (await phonePhoto()))], "photo.jpg", { type: "image/jpeg" }));
  return app.request(`/api/seller/listings/${listingId}/photos`, { method: "POST", headers: { cookie: await cookie(userId) }, body: form });
}

describe("seller listing editor API", () => {
  it("draft → autosave → photos → publish, end to end", async () => {
    const { owner } = await createSeller(db);
    const created = await call("POST", "/listings", owner.id);
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const saved = await call("PATCH", `/listings/${id}`, owner.id, {
      title: "Vintage Levi's 501",
      category: "jeans",
      tagSize: "W32 L32",
      measurements: { basis: "FLAT", waistCm: 41, lengthCm: 104 },
      condition: "GOOD",
      noFlawsConfirmed: true,
      pricePaise: 129900,
    });
    expect(saved.status).toBe(200);
    const { missing } = (await saved.json()) as { missing: { field: string }[] };
    expect(missing.map((m) => m.field)).toEqual(["photos", "photos", "photos"]);

    expect((await call("POST", `/listings/${id}/publish`, owner.id)).status).toBe(409);
    for (const kind of ["FRONT", "BACK", "LABEL"]) expect((await upload(owner.id, id, kind)).status).toBe(201);

    const published = await call("POST", `/listings/${id}/publish`, owner.id);
    expect(published.status).toBe(200);
    expect(((await published.json()) as { slug: string }).slug).toMatch(/^vintage-levis-501-/);

    const tabs = (await (await call("GET", "/listings?tab=live", owner.id)).json()) as { counts: Record<string, number> };
    expect(tabs.counts.live).toBe(1);
  });

  it("strips EXIF (including GPS) and re-encodes uploads as WebP", async () => {
    const { owner } = await createSeller(db);
    const { id } = (await (await call("POST", "/listings", owner.id)).json()) as { id: string };
    const res = await upload(owner.id, id, "FRONT", await phonePhoto(3000, 4000));
    expect(res.status).toBe(201);
    const { photo } = (await res.json()) as { photo: { storageKey: string; width: number; height: number } };

    const stored = media.objects.get(photo.storageKey)!;
    expect(stored.contentType).toBe("image/webp");
    const meta = await sharp(stored.body).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect([photo.width, photo.height]).toEqual([1500, 2000]); // fit inside 1600×2000
  });

  it("rejects files that aren't images, and tiny images", async () => {
    const { owner } = await createSeller(db);
    const { id } = (await (await call("POST", "/listings", owner.id)).json()) as { id: string };
    expect((await upload(owner.id, id, "FRONT", Buffer.from("not an image"))).status).toBe(400);
    expect((await upload(owner.id, id, "FRONT", await phonePhoto(200, 200))).status).toBe(400);
    expect((await upload(owner.id, id, "SELFIE")).status).toBe(400);
  });

  it("deleting a photo removes the stored object", async () => {
    const { owner } = await createSeller(db);
    const { id } = (await (await call("POST", "/listings", owner.id)).json()) as { id: string };
    const { photo } = (await (await upload(owner.id, id, "FRONT")).json()) as { photo: { id: string; storageKey: string } };
    expect(media.objects.has(photo.storageKey)).toBe(true);
    expect((await call("DELETE", `/listings/${id}/photos/${photo.id}`, owner.id)).status).toBe(200);
    expect(media.objects.has(photo.storageKey)).toBe(false);
  });

  it("buyers and other sellers get no access", async () => {
    const { owner } = await createSeller(db);
    const { owner: other } = await createSeller(db);
    const buyer = await createUser(db);
    const { id } = (await (await call("POST", "/listings", owner.id)).json()) as { id: string };

    expect((await call("GET", "/listings", buyer.id)).status).toBe(403);
    expect((await call("GET", `/listings/${id}`, other.id)).status).toBe(404);
    expect((await call("PATCH", `/listings/${id}`, other.id, { title: "stolen" })).status).toBe(404);
    expect((await upload(other.id, id, "FRONT")).status).toBe(404);
    expect((await app.request("/api/seller/listings")).status).toBe(401);
  });

  it("validates edits strictly", async () => {
    const { owner } = await createSeller(db);
    const { id } = (await (await call("POST", "/listings", owner.id)).json()) as { id: string };
    expect((await call("PATCH", `/listings/${id}`, owner.id, { category: "spaceships" })).status).toBe(400);
    expect((await call("PATCH", `/listings/${id}`, owner.id, { status: "SOLD" })).status).toBe(400);
    expect((await call("PATCH", `/listings/${id}`, owner.id, { measurements: { chestCm: -3 } })).status).toBe(400);
    expect((await call("PATCH", `/listings/${id}`, owner.id, { sellerId: "x" })).status).toBe(400);
  });
});
