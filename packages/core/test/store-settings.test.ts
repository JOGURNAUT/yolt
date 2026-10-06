import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { sellers } from "@yolt/db";
import { clearStoreImage, getStoreSettings, setStoreImage, updateStoreSettings } from "../src";
import { createSeller, testDb, truncateAll } from "./fixtures";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));

const PICKUP = { name: "Second Loop", phone: "98765 43210", line1: "12 MG Road, Camp", line2: "Near the post office", city: "Pune", state: "maharashtra", pincode: "411001" };

describe("store settings", () => {
  it("reads settings with read-only Instagram and verification", async () => {
    const { seller } = await createSeller(db, { instagramHandle: "second.loop", instagramVerifiedAt: new Date(), bio: "Hi" });
    expect(await getStoreSettings(db, seller.id)).toMatchObject({
      handle: seller.handle,
      instagramHandle: "second.loop",
      instagramVerified: true,
      kycStatus: "VERIFIED",
      bio: "Hi",
      dispatchDays: 2,
      shippingFeePaise: 7900,
      freeShippingAbovePaise: 199900,
      pickup: { pincode: "411001", line1: null },
    });
  });

  it("updates the given fields only and normalises the pickup address", async () => {
    const { seller } = await createSeller(db);
    const r = await updateStoreSettings(db, {
      sellerId: seller.id,
      patch: { bio: "  Hand-picked   vintage ", dispatchDays: 3, shippingFeePaise: 5000, freeShippingAbovePaise: null, pickup: PICKUP },
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.settings).toMatchObject({
      bio: "Hand-picked vintage",
      dispatchDays: 3,
      shippingFeePaise: 5000,
      freeShippingAbovePaise: null,
      pickup: { name: "Second Loop", phone: "+919876543210", city: "Pune", state: "Maharashtra", pincode: "411001" },
    });
    // Untouched fields keep their values.
    const again = await updateStoreSettings(db, { sellerId: seller.id, patch: { bio: null } });
    expect(again.ok && again.settings).toMatchObject({ bio: null, dispatchDays: 3 });
  });

  it("enforces bounds on every field and reports them all", async () => {
    const { seller } = await createSeller(db);
    const patch = { bio: "x".repeat(161), dispatchDays: 4, shippingFeePaise: 50_001, freeShippingAbovePaise: 9_999, pickup: { ...PICKUP, pincode: "123", state: "Narnia" } };
    const r = await updateStoreSettings(db, { sellerId: seller.id, patch });
    if (r.ok || r.reason !== "INVALID") throw new Error("expected INVALID");
    expect(r.errors.map((e) => e.field).sort()).toEqual(["bio", "dispatchDays", "freeShippingAbovePaise", "pickup.pincode", "pickup.state", "shippingFeePaise"]);
    // Nothing was saved.
    expect((await getStoreSettings(db, seller.id))!.dispatchDays).toBe(2);
  });

  it("accepts the boundary values", async () => {
    const { seller } = await createSeller(db);
    for (const patch of [
      { bio: "x".repeat(160), dispatchDays: 1, shippingFeePaise: 0, freeShippingAbovePaise: 10_000 },
      { dispatchDays: 3, shippingFeePaise: 50_000, freeShippingAbovePaise: 5_000_000 },
    ]) {
      expect((await updateStoreSettings(db, { sellerId: seller.id, patch })).ok).toBe(true);
    }
  });

  it("never touches the Instagram handle, verification or KYC", async () => {
    const { seller } = await createSeller(db, { instagramHandle: "second.loop" });
    await updateStoreSettings(db, { sellerId: seller.id, patch: { bio: "New bio" } });
    const [row] = await db.select().from(sellers).where(eq(sellers.id, seller.id));
    expect(row).toMatchObject({ instagramHandle: "second.loop", kycStatus: "VERIFIED", status: "APPROVED", handle: seller.handle });
  });
});

describe("store images", () => {
  it("records the new image and hands back the key it replaced", async () => {
    const { seller } = await createSeller(db);
    expect(await setStoreImage(db, { sellerId: seller.id, kind: "logo", url: "https://m/a.webp", key: "stores/a.webp" })).toEqual({ ok: true, previousKey: null });
    expect(await setStoreImage(db, { sellerId: seller.id, kind: "logo", url: "https://m/b.webp", key: "stores/b.webp" })).toEqual({ ok: true, previousKey: "stores/a.webp" });
    expect(await setStoreImage(db, { sellerId: seller.id, kind: "banner", url: "https://m/c.webp", key: "stores/c.webp" })).toEqual({ ok: true, previousKey: null });
    expect(await getStoreSettings(db, seller.id)).toMatchObject({ logoUrl: "https://m/b.webp", bannerUrl: "https://m/c.webp" });

    expect(await clearStoreImage(db, { sellerId: seller.id, kind: "logo" })).toEqual({ ok: true, previousKey: "stores/b.webp" });
    expect(await getStoreSettings(db, seller.id)).toMatchObject({ logoUrl: null, bannerUrl: "https://m/c.webp" });
  });
});
