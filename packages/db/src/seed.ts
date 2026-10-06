/**
 * Local demo data: one made-up store ("Second Loop") with in-stock, sold-out and
 * coming-soon items, two demo buyers and verified-purchase reviews.
 * Clearly fake — never run against a real database.
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { createDb } from "./index";
import * as s from "./schema";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("Refusing to seed a non-local database");

const { db, close } = createDb(url, { max: 1 });
const day = 86_400_000;
const now = Date.now();

type Item = Omit<typeof s.listings.$inferInsert, "sellerId" | "slug" | "title"> & { title: string };

const inStock: Item[] = [
  { title: "Vintage Levi's 501 jeans", category: "jeans", brandDeclared: "Levi's", tagSize: "W32 L32", measurements: { basis: "FLAT", waistCm: 41, lengthCm: 104, inseamCm: 80 }, condition: "GOOD", flaws: "Small bleach spot near left back pocket (photo 5).", pricePaise: 129900 },
  { title: "Oversized Carhartt workwear jacket, brown", category: "jackets", brandDeclared: "Carhartt", tagSize: "L", measurements: { basis: "FLAT", chestCm: 64, lengthCm: 74, sleeveCm: 62 }, condition: "LIKE_NEW", noFlawsConfirmed: true, pricePaise: 245000 },
  { title: "Y2K graphic baby tee", category: "tops", tagSize: "S", measurements: { basis: "FLAT", chestCm: 42, lengthCm: 50 }, condition: "GOOD", noFlawsConfirmed: true, pricePaise: 54900 },
  { title: "Nike Air Force 1 '07", category: "sneakers", brandDeclared: "Nike", tagSize: "UK 8", measurements: { footLengthCm: 27 }, condition: "FAIR", flaws: "Creasing on toe box, yellowing on sole edge.", pricePaise: 320000 },
  { title: "Mini shoulder bag, beige faux leather", category: "bags", tagSize: "One size", measurements: {}, condition: "LIKE_NEW", noFlawsConfirmed: true, pricePaise: 79900 },
  { title: "Striped rugby polo, navy and cream", category: "tops", brandDeclared: "Tommy Hilfiger", tagSize: "M", measurements: { basis: "FLAT", chestCm: 56, lengthCm: 72 }, condition: "GOOD", flaws: "Collar slightly faded.", pricePaise: 89900 },
  { title: "Corduroy wide-leg trousers, olive", category: "trousers", tagSize: "W30", measurements: { basis: "FLAT", waistCm: 38, lengthCm: 102, hipCm: 52 }, condition: "LIKE_NEW", noFlawsConfirmed: true, pricePaise: 99900 },
  { title: "Wool cable-knit sweater, cream", category: "knitwear", tagSize: "L", measurements: { basis: "FLAT", chestCm: 60, lengthCm: 68 }, condition: "GOOD", flaws: "One small pull on right sleeve (photo 4).", pricePaise: 114900 },
];

const soldOut: Item[] = [
  { title: "90s windbreaker, teal and purple", category: "jackets", tagSize: "XL", measurements: { basis: "FLAT", chestCm: 66 }, condition: "GOOD", noFlawsConfirmed: true, pricePaise: 149900 },
  { title: "Denim trucker jacket, light wash", category: "jackets", brandDeclared: "Levi's", tagSize: "M", measurements: { basis: "FLAT", chestCm: 55 }, condition: "GOOD", noFlawsConfirmed: true, pricePaise: 179900 },
  { title: "Band tee, faded black", category: "tops", tagSize: "L", measurements: { basis: "FLAT", chestCm: 57 }, condition: "FAIR", flaws: "Print cracking, as expected for age.", pricePaise: 69900 },
  { title: "Pleated tennis skirt, white", category: "skirts", tagSize: "S", measurements: { basis: "FLAT", waistCm: 34, lengthCm: 40 }, condition: "LIKE_NEW", noFlawsConfirmed: true, pricePaise: 59900 },
];

const comingSoon: Item[] = [
  { title: "Varsity bomber, red and white", category: "jackets", tagSize: "M", measurements: { basis: "FLAT", chestCm: 58 }, condition: "GOOD", noFlawsConfirmed: true, pricePaise: 279900 },
  { title: "Vintage Adidas track pants", category: "trousers", brandDeclared: "Adidas", tagSize: "M", measurements: { basis: "FLAT", waistCm: 36, lengthCm: 104 }, condition: "GOOD", noFlawsConfirmed: true, pricePaise: 119900 },
  { title: "Flannel overshirt, green check", category: "shirts", tagSize: "L", measurements: { basis: "FLAT", chestCm: 61 }, condition: "LIKE_NEW", noFlawsConfirmed: true, pricePaise: 94900 },
];

/** 7:00 PM IST (13:30 UTC), seven days from today. */
function nextWeekAt7pmIST() {
  const d = new Date(now + 7 * day);
  d.setUTCHours(13, 30, 0, 0);
  return d;
}

const slugify = (t: string) =>
  t.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

await db.execute(sql`
  TRUNCATE notification_deliveries, push_subscriptions, rate_limit_hits, seller_applications, buyer_preferences, homepage_slots, drop_reminders, bag_items, admins, claims, shipment_events, shipments, sessions, otp_challenges, audit_events, outbox_events, refunds, payment_events, payment_attempts, reviews,
    order_items, holds, orders, saved_items, follows, listing_photos, listings, drops,
    addresses, sellers, users RESTART IDENTITY CASCADE`);

const [owner, ananya, kabir, curator] = await db
  .insert(s.users)
  .values([
    { name: "Second Loop (demo seller)", phone: "+910000000001" },
    { name: "Ananya (demo buyer)", phone: "+910000000002" },
    { name: "Kabir (demo buyer)", phone: "+910000000003" },
    { name: "YOLT staff (demo curator)", phone: "+910000000004" },
  ])
  .returning();

const [seller] = await db
  .insert(s.sellers)
  .values({
    userId: owner!.id,
    track: "STORE",
    status: "APPROVED",
    kycStatus: "VERIFIED",
    handle: "secondloop",
    displayName: "Second Loop",
    bio: "Hand-picked vintage & streetwear. Washed, steamed, shipped in 2 days.",
    instagramHandle: "secondloop.thrift",
    instagramVerifiedAt: new Date(now - 60 * day),
    pickupState: "Maharashtra",
    pickupPincode: "411001",
    shippingFeePaise: 7900,
    freeShippingAbovePaise: 199900,
    dispatchDays: 2,
  })
  .returning();

const [drop] = await db
  .insert(s.drops)
  .values({ sellerId: seller!.id, title: "Winter Vintage Drop", startsAt: nextWeekAt7pmIST(), status: "SCHEDULED" })
  .returning();

const insert = (items: Item[], extra: Partial<typeof s.listings.$inferInsert>, offsetDays: number) =>
  db
    .insert(s.listings)
    .values(
      items.map((it, i) => ({
        sellerId: seller!.id,
        slug: `${slugify(it.title)}-${Math.random().toString(36).slice(2, 7)}`,
        publishedAt: new Date(now - (offsetDays + i) * day),
        ...it,
        ...extra,
      })),
    )
    .returning();

const live = await insert(inStock, { status: "AVAILABLE" }, 0);
const sold = (await insert(soldOut, { status: "SOLD" }, 10)).map(s.asComplete);
await insert(comingSoon, { status: "SCHEDULED", dropId: drop!.id, publishedAt: null }, 0);
await db.execute(sql`UPDATE listings SET sold_at = published_at + interval '1 day' WHERE status = 'SOLD'`);

// Past delivered orders for the sold items, so the reviews are verified purchases.
const reviewTexts = [
  { rating: 5, body: "Exactly as described, even the tiny spot was shown. Packed so well!" },
  { rating: 5, body: "Fits perfectly — the measurements were spot on. Shipped next day." },
  { rating: 4, body: "Lovely piece. Print cracking was mentioned upfront, no surprises." },
  { rating: 5, body: "Super fresh, smelled clean. Will buy again." },
];
for (const [i, l] of sold.entries()) {
  const buyer = i % 2 === 0 ? ananya! : kabir!;
  const shipping = l.pricePaise >= 199900 ? 0 : 7900;
  const [order] = await db
    .insert(s.orders)
    .values({
      reference: `YL-DEMO${i}`,
      buyerId: buyer.id,
      sellerId: seller!.id,
      status: "CLOSED",
      subtotalPaise: l.pricePaise,
      shippingPaise: shipping,
      totalPaise: l.pricePaise + shipping,
      confirmedAt: new Date(now - (20 - i) * day),
    })
    .returning();
  const [item] = await db
    .insert(s.orderItems)
    .values({
      orderId: order!.id,
      listingId: l.id,
      pricePaise: l.pricePaise,
      allocated: true,
      snapshot: {
        title: l.title,
        category: l.category,
        brandDeclared: l.brandDeclared,
        tagSize: l.tagSize,
        measurements: l.measurements,
        condition: l.condition,
        flaws: l.flaws,
        photoUrl: null,
      },
    })
    .returning();
  const review = reviewTexts[i % reviewTexts.length]!;
  await db.insert(s.reviews).values({
    orderItemId: item!.id,
    sellerId: seller!.id,
    buyerId: buyer.id,
    rating: review.rating,
    accuracyRating: review.rating,
    body: review.body,
    sellerReply: i === 0 ? "Thank you Ananya! Enjoy them 💚" : null,
    createdAt: new Date(now - (15 - i) * day),
  });
}

// Homepage curation (demo): Second Loop as the featured store, and a Grails list of its priciest live pieces.
const grails = [...live].sort((a, b) => (b.pricePaise ?? 0) - (a.pricePaise ?? 0)).slice(0, 4);
await db.insert(s.homepageSlots).values([
  { kind: "FEATURED_STORE", sellerId: seller!.id, createdBy: curator!.id },
  { kind: "GRAILS", listingIds: grails.map((l) => l.id), createdBy: curator!.id },
]);

await close();
console.log(`Seeded store /s/secondloop — demo buyer ids: ${ananya!.id} (Ananya), ${kabir!.id} (Kabir)`);
