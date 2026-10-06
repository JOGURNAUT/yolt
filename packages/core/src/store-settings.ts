import { eq } from "drizzle-orm";
import {
  DISPATCH_DAYS_RANGE,
  FREE_SHIPPING_ABOVE_RANGE,
  MAX_BIO_LENGTH,
  MAX_SHIPPING_FEE_PAISE,
  validateAddress,
  type AddressError,
  type AddressInput,
} from "@yolt/shared";
import { sellers, type Db } from "@yolt/db";

/**
 * Store settings for the signed-in seller (docs/user-flows.md S-F2): bio, dispatch time, shipping
 * rule, pickup address and images. The Instagram handle, KYC and handle (URL) are read-only here:
 * they change only through staff.
 */

type Seller = typeof sellers.$inferSelect;

export function storeSettingsView(s: Seller) {
  return {
    handle: s.handle,
    displayName: s.displayName,
    track: s.track,
    instagramHandle: s.instagramHandle,
    instagramVerified: s.instagramVerifiedAt !== null,
    kycStatus: s.kycStatus,
    bio: s.bio,
    logoUrl: s.logoUrl,
    bannerUrl: s.bannerUrl,
    dispatchDays: s.dispatchDays,
    shippingFeePaise: s.shippingFeePaise,
    freeShippingAbovePaise: s.freeShippingAbovePaise,
    pickup: {
      name: s.pickupName,
      phone: s.pickupPhone,
      line1: s.pickupLine1,
      line2: s.pickupLine2,
      landmark: s.pickupLandmark,
      city: s.pickupCity,
      state: s.pickupState,
      pincode: s.pickupPincode,
    },
  };
}
export type StoreSettings = ReturnType<typeof storeSettingsView>;

export async function getStoreSettings(db: Db, sellerId: string): Promise<StoreSettings | null> {
  const [s] = await db.select().from(sellers).where(eq(sellers.id, sellerId));
  return s ? storeSettingsView(s) : null;
}

export type StoreSettingsPatch = {
  bio?: string | null;
  dispatchDays?: number;
  shippingFeePaise?: number;
  freeShippingAbovePaise?: number | null;
  pickup?: AddressInput;
};

export type UpdateStoreSettingsResult =
  | { ok: true; settings: StoreSettings }
  | { ok: false; reason: "NOT_FOUND" }
  | { ok: false; reason: "INVALID"; errors: { field: string; message: string }[] };

const intIn = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max;

export async function updateStoreSettings(
  db: Db,
  input: { sellerId: string; patch: StoreSettingsPatch; now?: Date },
): Promise<UpdateStoreSettingsResult> {
  const p = input.patch;
  const errors: { field: string; message: string }[] = [];
  const set: Partial<typeof sellers.$inferInsert> = {};

  if (p.bio !== undefined) {
    const bio = p.bio === null ? null : p.bio.replace(/\s+/g, " ").trim() || null;
    if (bio && bio.length > MAX_BIO_LENGTH) errors.push({ field: "bio", message: `Keep your bio to ${MAX_BIO_LENGTH} characters.` });
    set.bio = bio;
  }
  if (p.dispatchDays !== undefined) {
    if (!intIn(p.dispatchDays, DISPATCH_DAYS_RANGE.min, DISPATCH_DAYS_RANGE.max)) {
      errors.push({ field: "dispatchDays", message: `Dispatch in ${DISPATCH_DAYS_RANGE.min} to ${DISPATCH_DAYS_RANGE.max} days.` });
    }
    set.dispatchDays = p.dispatchDays;
  }
  if (p.shippingFeePaise !== undefined) {
    if (!intIn(p.shippingFeePaise, 0, MAX_SHIPPING_FEE_PAISE)) errors.push({ field: "shippingFeePaise", message: "Shipping can be ₹0 to ₹500." });
    set.shippingFeePaise = p.shippingFeePaise;
  }
  if (p.freeShippingAbovePaise !== undefined) {
    const v = p.freeShippingAbovePaise;
    if (v !== null && !intIn(v, FREE_SHIPPING_ABOVE_RANGE.min, FREE_SHIPPING_ABOVE_RANGE.max)) {
      errors.push({ field: "freeShippingAbovePaise", message: "Free shipping can start from ₹100 up to ₹50,000, or be turned off." });
    }
    set.freeShippingAbovePaise = v;
  }
  if (p.pickup !== undefined) {
    const v = validateAddress(p.pickup);
    if (!v.ok) errors.push(...v.errors.map((e: AddressError) => ({ field: `pickup.${e.field}`, message: e.message })));
    else {
      const a = v.address;
      Object.assign(set, {
        pickupName: a.name,
        pickupPhone: a.phone,
        pickupLine1: a.line1,
        pickupLine2: a.line2,
        pickupLandmark: a.landmark,
        pickupCity: a.city,
        pickupState: a.state,
        pickupPincode: a.pincode,
      });
    }
  }
  if (errors.length) return { ok: false, reason: "INVALID", errors };

  const [updated] = await db
    .update(sellers)
    .set({ ...set, updatedAt: input.now ?? new Date() })
    .where(eq(sellers.id, input.sellerId))
    .returning();
  return updated ? { ok: true, settings: storeSettingsView(updated) } : { ok: false, reason: "NOT_FOUND" };
}

export type StoreImageKind = "logo" | "banner";

/** Records an uploaded logo or banner and returns the storage key it replaced, for cleanup. */
export async function setStoreImage(
  db: Db,
  input: { sellerId: string; kind: StoreImageKind; url: string; key: string },
): Promise<{ ok: true; previousKey: string | null } | { ok: false; reason: "NOT_FOUND" }> {
  const columns = input.kind === "logo" ? { logoUrl: input.url, logoKey: input.key } : { bannerUrl: input.url, bannerKey: input.key };
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(sellers).where(eq(sellers.id, input.sellerId)).for("update");
    if (!before) return { ok: false, reason: "NOT_FOUND" } as const;
    await tx.update(sellers).set({ ...columns, updatedAt: new Date() }).where(eq(sellers.id, before.id));
    return { ok: true, previousKey: (input.kind === "logo" ? before.logoKey : before.bannerKey) ?? null } as const;
  });
}

export async function clearStoreImage(db: Db, input: { sellerId: string; kind: StoreImageKind }) {
  const columns = input.kind === "logo" ? { logoUrl: null, logoKey: null } : { bannerUrl: null, bannerKey: null };
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(sellers).where(eq(sellers.id, input.sellerId)).for("update");
    if (!before) return { ok: false, reason: "NOT_FOUND" } as const;
    await tx.update(sellers).set({ ...columns, updatedAt: new Date() }).where(eq(sellers.id, before.id));
    return { ok: true, previousKey: (input.kind === "logo" ? before.logoKey : before.bannerKey) ?? null } as const;
  });
}
