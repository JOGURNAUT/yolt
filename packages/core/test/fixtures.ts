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
    TRUNCATE audit_events, outbox_events, refunds, payment_events, payment_attempts, reviews,
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
