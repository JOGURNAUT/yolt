import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { createDb, listings, sellers, users, type Db } from "@yolt/db";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

export function testDb(max = 20) {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  return createDb(url, { max });
}

export async function truncateAll(db: Db) {
  await db.execute(sql`
    TRUNCATE drop_reminders, bag_items, admins, claims, shipment_events, shipments, sessions, otp_challenges, audit_events, outbox_events, refunds, payment_events, payment_attempts, reviews,
      order_items, holds, orders, saved_items, follows, listing_photos, listings, drops,
      addresses, sellers, users RESTART IDENTITY CASCADE`);
}

export async function createUser(db: Db, name = "Buyer") {
  const [u] = await db.insert(users).values({ name, phone: `+91${Math.floor(6e9 + Math.random() * 3e9)}` }).returning();
  return u!;
}

export async function createSeller(db: Db, opts: Partial<typeof sellers.$inferInsert> = {}) {
  const owner = await createUser(db, "Seller");
  const [s] = await db
    .insert(sellers)
    .values({
      userId: owner.id,
      track: "STORE",
      status: "APPROVED",
      kycStatus: "VERIFIED",
      handle: `store-${randomUUID().slice(0, 8)}`,
      displayName: "Second Loop",
      shippingFeePaise: 7900,
      freeShippingAbovePaise: 199900,
      pickupPincode: "411001",
      ...opts,
    })
    .returning();
  return { seller: s!, owner };
}

export async function createListing(db: Db, sellerId: string, opts: Partial<typeof listings.$inferInsert> = {}) {
  const [l] = await db
    .insert(listings)
    .values({
      sellerId,
      slug: `item-${randomUUID()}`,
      title: "Vintage Levi's 501",
      category: "jeans",
      tagSize: "W32 L32",
      measurements: { basis: "FLAT", waistCm: 41, lengthCm: 104 },
      condition: "GOOD",
      flaws: "Small bleach spot near left back pocket",
      pricePaise: 129900,
      status: "AVAILABLE",
      publishedAt: new Date(),
      ...opts,
    })
    .returning();
  return l!;
}

export const TEST_ADDRESS = {
  name: "Ananya Sharma",
  phone: "+919876543210",
  line1: "Flat 12, Sunrise Apartments",
  city: "Pune",
  state: "Maharashtra",
  pincode: "411001",
};

/** A confirmed (paid) order, created through the real checkout → address → payment → webhook path. */
export async function paidOrder(db: Db, opts: { now?: Date } = {}) {
  const { createCheckout, setOrderShippingAddress, startPayment, handlePaymentEvent } = await import("../src");
  const { seller, owner } = await createSeller(db);
  const listing = await createListing(db, seller.id);
  const buyer = await createUser(db);
  const r = await createCheckout(db, { buyerId: buyer.id, listingIds: [listing.id], now: opts.now });
  if (!r.ok) throw new Error(`checkout failed: ${r.reason}`);
  await setOrderShippingAddress(db, { orderId: r.orderId, buyerId: buyer.id, address: TEST_ADDRESS, now: opts.now });
  const providerOrderId = `pay_${r.orderId}`;
  const started = await startPayment(db, { orderId: r.orderId, buyerId: buyer.id, provider: "sandbox", providerOrderId, now: opts.now });
  if (!started.ok) throw new Error(`payment failed to start: ${started.reason}`);
  const paid = await handlePaymentEvent(db, {
    provider: "sandbox",
    providerEventId: `evt_${r.orderId}`,
    type: "payment.succeeded",
    providerOrderId,
    amountPaise: started.amountPaise,
    currency: "INR",
    now: opts.now,
  });
  if (paid.status !== "CONFIRMED") throw new Error(`payment not confirmed: ${paid.status}`);
  return { seller, owner, listing, buyer, orderId: r.orderId };
}

/** A delivered order: paid, pickup booked, and a DELIVERED courier scan at `deliveredAt`. */
export async function deliveredOrder(db: Db, opts: { deliveredAt?: Date } = {}) {
  const { recordShipmentBooked, applyTrackingEvent } = await import("../src");
  const p = await paidOrder(db);
  const awb = `AWB${randomUUID().slice(0, 8)}`;
  const booked = await recordShipmentBooked(db, {
    sellerId: p.seller.id,
    orderId: p.orderId,
    actorUserId: p.owner.id,
    booking: { provider: "dev", providerShipmentId: `s_${awb}`, awb, courierName: "Dev Express" },
  });
  if (!booked.ok) throw new Error(booked.reason);
  await applyTrackingEvent(db, { provider: "dev", awb, providerEventId: `d_${awb}`, status: "DELIVERED", occurredAt: opts.deliveredAt ?? new Date() });
  return { ...p, awb };
}
