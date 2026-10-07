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
  {
    // Priced and described the way a thrift page writes it: a flat price with free shipping, a measured range, a 10/10 grade.
    title: "Retro souvenir jacket, navy satin with an embroidered bird",
    category: "jackets",
    tagSize: "Free size, fits L/XL",
    // The seller measures in inches: chest 46 to 50 (a range, so the middle), length 27.
    measurements: { basis: "AROUND", chestCm: 122, lengthCm: 69 },
    condition: "LIKE_NEW",
    noFlawsConfirmed: true,
    description:
      "Retro jacket in pristine condition: navy satin body with cream sleeves, a pink-trimmed collar and a large embroidered bird among flowers across the front, with more flowers on the sleeves. Boxy fit, free size, fits L to XL. Chest 46 to 50 in, length 27 in. Condition 10/10.",
    pricePaise: 199900,
  },
  {
    // Photos: `pnpm demo:photos` (images/cargo-pants-*).
    title: "Black zip-off cargo pants, strap detail",
    category: "trousers",
    tagSize: "W30",
    measurements: { basis: "FLAT", waistCm: 38, hipCm: 54, lengthCm: 108, inseamCm: 78 },
    condition: "GOOD",
    flaws: "Loose threads along the hem of both legs (see the last photos).",
    description:
      "Black cargo pants with legs that zip off at the knee, so they turn into shorts. Loaded with hardware: D-ring straps at the waist, buckle-and-eyelet pockets on both thighs, a column of eyelets down the back and long strap tails that hang at the sides. Soft washed black cotton twill with a wide, relaxed leg. The hem is frayed on both legs; everything else is in good shape.",
    pricePaise: 219900,
  },
  {
    title: 'Evisu "Year of the Rooster" selvedge jeans, no. 002 of 380',
    category: "jeans",
    brandDeclared: "Evisu",
    tagSize: "W31",
    // 31 in waist, 40 in length (the seller gave rise and thigh too; those have no field yet, so they are in the description).
    measurements: { basis: "AROUND", waistCm: 79, lengthCm: 102 },
    condition: "LIKE_NEW",
    noFlawsConfirmed: true,
    description:
      "Evisu's collectable \"Year of the Rooster\" jeans, made in limited numbers: only 380 pieces in the world, and this is no. 002. Signature 2008 regular-fit selvedge denim. The coin pocket carries the red Godhead print. The Kanji character for Rooster and the Katakana characters of Evisu are on the rear pockets, and motifs of a fierce rooster and kamon are embroidered on the black Daicock insert. As measured by the seller: waist 31 in, length 40 in, rise 12 in, thigh 12 in.",
    pricePaise: 1450000,
  },
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

/**
 * A second store, from the Instagram posts of @cybrbride: a vintage denim jacket the caption marks SOLD, and handmade boots
 * that are not. Real posts used only as local demo data; nothing here claims she is verified, reviewed or followed.
 */
const cybrbridePieces: { sold: Item[]; inStock: Item[] } = {
  sold: [
    {
      // Measured the way a thrift page does it: in inches, with ranges (shoulder 15, chest up to 34, waist 27 to 28, sleeves 24, length 19 to 20).
      title: "Vintage asymmetric denim jacket, crystal and chain shoulder",
      category: "jackets",
      tagSize: "XS-S",
      measurements: { basis: "AROUND", shoulderCm: 38, chestCm: 86, waistCm: 70, sleeveCm: 61, lengthCm: 49 },
      condition: "LIKE_NEW",
      noFlawsConfirmed: true,
      description:
        "Rare vintage asymmetric denim jacket in a washed, faded blue-black, with an ornate crystal and chain embellishment across the shoulder. Button front with domed metal buttons, striped lining. Size XS to S. Condition 10/10, zero defects. Shoulder 15 in, chest up to 34 in, waist 27 to 28 in, sleeves 24 in, length 19 to 20 in.",
      pricePaise: 349900,
    },
  ],
  inStock: [
    {
      // 1 of 1, handmade; the maker priced it on request, so this price is a placeholder for the demo.
      title: "KERF FORM1 handmade horned boots, 1 of 1",
      category: "footwear",
      brandDeclared: "KERF",
      tagSize: "EU 40-41 / UK 6.5-7",
      measurements: {},
      condition: "LIKE_NEW",
      noFlawsConfirmed: true,
      description:
        "Some designs sit in your head for years before they take shape, and this pair took its time. Influenced by the tactile language of 1vfudie and early-2000s SWEAR London silhouettes (the Rhino and Armadillo platforms), built to feel raw, excessive and still wearable: layers, textures, straps, things that move with you, and of course the horns.\n\nReal repurposed leather throughout, with cowhide grained leather across the layered scraps. Durable rubber horns, sturdy and built to hold their shape over time. Every detail is hand-stitched and reworked by hand, so no two parts sit quite the same. Back zippers for easy wear.\n\nSize EU 40-41 / UK 6.5-7. Made to be worn and looked at.",
      pricePaise: 2250000,
    },
  ],
};

/**
 * A third store, from the @thriftllc.in Instagram post "Vintage biker collection": a drop on the coming Saturday at 6 PM IST.
 * The post gives no sizes, prices or flaws, so none are invented: sizes and measurements stay empty and flaws "not specified",
 * and the prices are demo placeholders (commenters on the post were asking for them). Not marked verified.
 */
const thriftllcPieces: Item[] = [
  { title: "Dainese yellow and black leather racing jacket", category: "jackets", brandDeclared: "Dainese", measurements: {}, condition: "GOOD", pricePaise: 1499900 },
  { title: "Dainese white and grey leather racing jacket", category: "jackets", brandDeclared: "Dainese", measurements: {}, condition: "GOOD", pricePaise: 1699900 },
  { title: "FXR purple camo snow jacket", category: "jackets", brandDeclared: "FXR", measurements: {}, condition: "GOOD", pricePaise: 649900 },
  { title: "White leather racing jacket, Blade Trinity print", category: "jackets", measurements: {}, condition: "GOOD", pricePaise: 1199900 },
];

/** The coming Saturday at 6:00 PM IST (12:30 UTC); a Saturday that is today counts as next week's. */
function nextSaturday6pmIST() {
  const d = new Date(now);
  d.setUTCHours(12, 30, 0, 0);
  const ahead = (6 - d.getUTCDay() + 7) % 7 || 7;
  return new Date(d.getTime() + ahead * day);
}

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

const [owner, ananya, kabir, curator, cyber, thriftllcOwner] = await db
  .insert(s.users)
  .values([
    { name: "Second Loop (demo seller)", phone: "+910000000001" },
    { name: "Ananya (demo buyer)", phone: "+910000000002" },
    { name: "Kabir (demo buyer)", phone: "+910000000003" },
    { name: "YOLT staff (demo curator)", phone: "+910000000004" },
    { name: "cybrbride (demo seller)", phone: "+910000000005" },
    { name: "thriftllc.in (demo seller)", phone: "+910000000006" },
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

const insert = (items: Item[], extra: Partial<typeof s.listings.$inferInsert>, offsetDays: number, sellerId = seller!.id) =>
  db
    .insert(s.listings)
    .values(
      items.map((it, i) => ({
        sellerId,
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

// A second store (see cybrbridePieces): one piece sold, one in stock, so the pills have both to show.
// Not marked verified (no Instagram or identity check), and no invented reviews, followers or rating.
const [cybrbride] = await db
  .insert(s.sellers)
  .values({
    userId: cyber!.id,
    track: "STORE",
    status: "APPROVED",
    kycStatus: "PENDING",
    handle: "cybrbride",
    displayName: "cybrbride",
    // Demo text, not hers.
    bio: "Vintage finds and handmade one-of-ones.",
    instagramHandle: "cybrbride",
    shippingFeePaise: 7900,
    freeShippingAbovePaise: 199900,
    dispatchDays: 3,
  })
  .returning();
await insert(cybrbridePieces.inStock, { status: "AVAILABLE" }, 1, cybrbride!.id);
await insert(cybrbridePieces.sold, { status: "SOLD" }, 20, cybrbride!.id);

// A third store with a drop of its own: four pieces, scheduled for Saturday 6 PM IST. Its cover comes from `pnpm demo:photos`
// (images/biker-collection-cover.*); not marked verified.
const [thriftllc] = await db
  .insert(s.sellers)
  .values({
    userId: thriftllcOwner!.id,
    track: "STORE",
    status: "APPROVED",
    kycStatus: "PENDING",
    handle: "thriftllc",
    displayName: "thriftllc.in",
    // Demo text, not theirs.
    bio: "Vintage biker jackets and racing pants.",
    instagramHandle: "thriftllc.in",
    shippingFeePaise: 9900,
    freeShippingAbovePaise: 499900,
    dispatchDays: 2,
  })
  .returning();
const [bikerDrop] = await db
  .insert(s.drops)
  .values({ sellerId: thriftllc!.id, title: "Vintage biker collection", startsAt: nextSaturday6pmIST(), status: "SCHEDULED", maxHoldsPerBuyer: 2 })
  .returning();
await insert(thriftllcPieces, { status: "SCHEDULED", dropId: bikerDrop!.id, publishedAt: null }, 0, thriftllc!.id);
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
