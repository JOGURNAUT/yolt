import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { MAX_PHOTOS, publishReadiness, type Measurements, type MissingField, type PhotoKind } from "@yolt/shared";
import { auditEvents, listingPhotos, listings, outboxEvents, sellers, type Db, type Listing, type Tx } from "@yolt/db";

/**
 * Seller-side listing lifecycle (docs/user-flows.md S-F3, S-F4).
 * Every function takes the acting seller's id and only touches that seller's rows.
 */

/** Statuses a seller may edit. Reserved/paying/sold items are frozen; drop items are frozen once scheduled. */
const EDITABLE = ["DRAFT", "AVAILABLE", "WITHDRAWN"] as const;

export type ListingPatch = {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  brandDeclared?: string | null;
  tagSize?: string | null;
  measurements?: Measurements;
  condition?: Listing["condition"];
  flaws?: string | null;
  noFlawsConfirmed?: boolean;
  pricePaise?: number | null;
  sizeReturnsAllowed?: boolean;
  allowOffers?: boolean;
};

type Fail<R extends string> = { ok: false; reason: R };
type NotEditable = Fail<"NOT_FOUND"> | Fail<"NOT_EDITABLE">;

const slugify = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ'’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "item";

const suffix = () => randomBytes(4).toString("hex").slice(0, 6);

/** Loads a listing owned by the seller and locks it for the rest of the transaction. */
async function lockOwned(tx: Tx, sellerId: string, listingId: string) {
  const [l] = await tx
    .select()
    .from(listings)
    .where(and(eq(listings.id, listingId), eq(listings.sellerId, sellerId)))
    .for("update");
  return l ?? null;
}

async function photoKinds(tx: Db | Tx, listingId: string) {
  const rows = await tx.select({ kind: listingPhotos.kind }).from(listingPhotos).where(eq(listingPhotos.listingId, listingId));
  return rows.map((r) => r.kind);
}

export function readinessOf(l: Listing, kinds: string[]) {
  return publishReadiness({
    title: l.title,
    category: l.category,
    tagSize: l.tagSize,
    measurements: l.measurements,
    condition: l.condition,
    flaws: l.flaws,
    noFlawsConfirmed: l.noFlawsConfirmed,
    pricePaise: l.pricePaise,
    photoKinds: kinds,
  });
}

// ---------------------------------------------------------------------------

export async function createDraft(db: Db, input: { sellerId: string }) {
  const [seller] = await db
    .select({ sizeReturnsDefault: sellers.sizeReturnsDefault })
    .from(sellers)
    .where(eq(sellers.id, input.sellerId));
  if (!seller) throw new Error(`seller ${input.sellerId} not found`);
  const [draft] = await db
    .insert(listings)
    .values({
      sellerId: input.sellerId,
      slug: `draft-${suffix()}${suffix()}`,
      status: "DRAFT",
      sizeReturnsAllowed: seller.sizeReturnsDefault,
    })
    .returning();
  return draft!;
}

export type UpdateListingResult =
  | { ok: true; listing: Listing; missing: MissingField[] }
  | NotEditable
  /** A live listing can't be edited into an incomplete state; withdraw it first. */
  | { ok: false; reason: "WOULD_BREAK_LIVE_LISTING"; missing: MissingField[] };

export async function updateListing(
  db: Db,
  input: { sellerId: string; listingId: string; patch: ListingPatch; now?: Date },
): Promise<UpdateListingResult> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const current = await lockOwned(tx, input.sellerId, input.listingId);
    if (!current) return { ok: false, reason: "NOT_FOUND" } as const;
    if (!(EDITABLE as readonly string[]).includes(current.status)) return { ok: false, reason: "NOT_EDITABLE" } as const;

    const next = { ...current, ...input.patch, updatedAt: now };
    const { missing } = readinessOf(next, await photoKinds(tx, current.id));
    if (current.status === "AVAILABLE" && missing.length > 0) {
      return { ok: false, reason: "WOULD_BREAK_LIVE_LISTING", missing } as const;
    }

    const [updated] = await tx
      .update(listings)
      .set({ ...input.patch, updatedAt: now })
      .where(eq(listings.id, current.id))
      .returning();
    if (current.status === "AVAILABLE" && input.patch.pricePaise !== undefined && input.patch.pricePaise !== current.pricePaise) {
      await tx.insert(auditEvents).values({
        actorRole: "seller",
        action: "listing.price_changed",
        entity: "listing",
        entityId: current.id,
        before: { pricePaise: current.pricePaise },
        after: { pricePaise: input.patch.pricePaise },
      });
    }
    return { ok: true, listing: updated!, missing } as const;
  });
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export type AddPhotoResult =
  | { ok: true; photo: typeof listingPhotos.$inferSelect }
  | NotEditable
  | Fail<"TOO_MANY_PHOTOS">;

export async function addPhoto(
  db: Db,
  input: {
    sellerId: string;
    listingId: string;
    kind: PhotoKind;
    url: string;
    storageKey: string;
    width: number;
    height: number;
    caption?: string | null;
  },
): Promise<AddPhotoResult> {
  return db.transaction(async (tx) => {
    const l = await lockOwned(tx, input.sellerId, input.listingId);
    if (!l) return { ok: false, reason: "NOT_FOUND" } as const;
    if (!(EDITABLE as readonly string[]).includes(l.status)) return { ok: false, reason: "NOT_EDITABLE" } as const;

    const [{ n, maxPos }] = (await tx
      .select({ n: sql<number>`count(*)::int`, maxPos: sql<number>`coalesce(max(${listingPhotos.position}), -1)::int` })
      .from(listingPhotos)
      .where(eq(listingPhotos.listingId, l.id))) as [{ n: number; maxPos: number }];
    if (n >= MAX_PHOTOS) return { ok: false, reason: "TOO_MANY_PHOTOS" } as const;

    const [photo] = await tx
      .insert(listingPhotos)
      .values({
        listingId: l.id,
        url: input.url,
        storageKey: input.storageKey,
        width: input.width,
        height: input.height,
        kind: input.kind,
        caption: input.caption ?? null,
        position: maxPos + 1,
      })
      .returning();
    return { ok: true, photo: photo! } as const;
  });
}

export type RemovePhotoResult =
  | { ok: true; storageKey: string | null }
  | NotEditable
  | Fail<"PHOTO_NOT_FOUND">
  | { ok: false; reason: "WOULD_BREAK_LIVE_LISTING"; missing: MissingField[] };

/** Removes a photo row. The caller deletes the stored object after this commits. */
export async function removePhoto(
  db: Db,
  input: { sellerId: string; listingId: string; photoId: string },
): Promise<RemovePhotoResult> {
  return db.transaction(async (tx) => {
    const l = await lockOwned(tx, input.sellerId, input.listingId);
    if (!l) return { ok: false, reason: "NOT_FOUND" } as const;
    if (!(EDITABLE as readonly string[]).includes(l.status)) return { ok: false, reason: "NOT_EDITABLE" } as const;

    const photos = await tx.select().from(listingPhotos).where(eq(listingPhotos.listingId, l.id));
    const photo = photos.find((p) => p.id === input.photoId);
    if (!photo) return { ok: false, reason: "PHOTO_NOT_FOUND" } as const;

    if (l.status === "AVAILABLE") {
      const { missing } = readinessOf(l, photos.filter((p) => p.id !== photo.id).map((p) => p.kind));
      if (missing.length > 0) return { ok: false, reason: "WOULD_BREAK_LIVE_LISTING", missing } as const;
    }
    await tx.delete(listingPhotos).where(eq(listingPhotos.id, photo.id));
    await compactPositions(tx, l.id, photos.filter((p) => p.id !== photo.id).sort((a, b) => a.position - b.position).map((p) => p.id));
    return { ok: true, storageKey: photo.storageKey } as const;
  });
}

export type ReorderPhotosResult = { ok: true } | NotEditable | Fail<"PHOTO_SET_MISMATCH">;

/** Sets photo order; the first photo is the cover. `photoIds` must be exactly the listing's photos. */
export async function reorderPhotos(
  db: Db,
  input: { sellerId: string; listingId: string; photoIds: string[] },
): Promise<ReorderPhotosResult> {
  return db.transaction(async (tx) => {
    const l = await lockOwned(tx, input.sellerId, input.listingId);
    if (!l) return { ok: false, reason: "NOT_FOUND" } as const;
    if (!(EDITABLE as readonly string[]).includes(l.status)) return { ok: false, reason: "NOT_EDITABLE" } as const;
    const existing = await tx.select({ id: listingPhotos.id }).from(listingPhotos).where(eq(listingPhotos.listingId, l.id));
    const same =
      existing.length === input.photoIds.length &&
      new Set(input.photoIds).size === input.photoIds.length &&
      existing.every((p) => input.photoIds.includes(p.id));
    if (!same) return { ok: false, reason: "PHOTO_SET_MISMATCH" } as const;
    await compactPositions(tx, l.id, input.photoIds);
    return { ok: true } as const;
  });
}

/** Rewrites positions 0..n-1 in the given order without tripping the (listing, position) unique index. */
async function compactPositions(tx: Tx, listingId: string, orderedIds: string[]) {
  if (orderedIds.length === 0) return;
  await tx
    .update(listingPhotos)
    .set({ position: sql`${listingPhotos.position} + 1000` })
    .where(eq(listingPhotos.listingId, listingId));
  for (const [i, id] of orderedIds.entries()) {
    await tx.update(listingPhotos).set({ position: i }).where(eq(listingPhotos.id, id));
  }
}

// ---------------------------------------------------------------------------
// Publish / withdraw
// ---------------------------------------------------------------------------

export type PublishResult =
  | { ok: true; slug: string }
  | NotEditable
  | Fail<"SELLER_NOT_VERIFIED">
  | { ok: false; reason: "INCOMPLETE"; missing: MissingField[] };

export async function publishListing(
  db: Db,
  input: { sellerId: string; listingId: string; actorUserId: string; now?: Date },
): Promise<PublishResult> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [seller] = await tx.select().from(sellers).where(eq(sellers.id, input.sellerId));
    // docs/decisions.md D10: PAN + bank KYC before the first listing goes live.
    if (!seller || seller.status !== "APPROVED" || seller.kycStatus !== "VERIFIED") {
      return { ok: false, reason: "SELLER_NOT_VERIFIED" } as const;
    }
    const l = await lockOwned(tx, input.sellerId, input.listingId);
    if (!l) return { ok: false, reason: "NOT_FOUND" } as const;
    if (l.status !== "DRAFT" && l.status !== "WITHDRAWN") return { ok: false, reason: "NOT_EDITABLE" } as const;

    const { missing } = readinessOf(l, await photoKinds(tx, l.id));
    if (missing.length > 0) return { ok: false, reason: "INCOMPLETE", missing } as const;

    const slug = l.slug.startsWith("draft-") ? `${slugify(l.title!)}-${suffix()}` : l.slug;
    await tx
      .update(listings)
      .set({ status: "AVAILABLE", slug, publishedAt: l.publishedAt ?? now, updatedAt: now })
      .where(eq(listings.id, l.id));
    await tx.insert(outboxEvents).values({ type: "listing.published", payload: { listingId: l.id, sellerId: l.sellerId } });
    await tx.insert(auditEvents).values({
      actorId: input.actorUserId,
      actorRole: "seller",
      action: l.status === "DRAFT" ? "listing.published" : "listing.relisted",
      entity: "listing",
      entityId: l.id,
    });
    return { ok: true, slug } as const;
  });
}

export type WithdrawResult = { ok: true } | Fail<"NOT_FOUND"> | Fail<"BUYER_CHECKING_OUT"> | Fail<"NOT_AVAILABLE">;

/** Takes a live item off sale (e.g. to edit it heavily). Items a buyer holds can't be withdrawn. */
export async function withdrawListing(
  db: Db,
  input: { sellerId: string; listingId: string; actorUserId: string; now?: Date },
): Promise<WithdrawResult> {
  const now = input.now ?? new Date();
  const updated = await db
    .update(listings)
    .set({ status: "WITHDRAWN", updatedAt: now })
    .where(and(eq(listings.id, input.listingId), eq(listings.sellerId, input.sellerId), eq(listings.status, "AVAILABLE")))
    .returning({ id: listings.id });
  if (updated.length === 1) {
    await db.insert(auditEvents).values({
      actorId: input.actorUserId,
      actorRole: "seller",
      action: "listing.withdrawn",
      entity: "listing",
      entityId: input.listingId,
    });
    return { ok: true };
  }
  const [current] = await db
    .select({ status: listings.status })
    .from(listings)
    .where(and(eq(listings.id, input.listingId), eq(listings.sellerId, input.sellerId)));
  if (!current) return { ok: false, reason: "NOT_FOUND" };
  if (current.status === "RESERVED" || current.status === "PAYMENT_PENDING") return { ok: false, reason: "BUYER_CHECKING_OUT" };
  return { ok: false, reason: "NOT_AVAILABLE" };
}

/** Deletes a draft that never went live, returning storage keys to clean up. */
export async function deleteDraft(db: Db, input: { sellerId: string; listingId: string }) {
  return db.transaction(async (tx) => {
    const l = await lockOwned(tx, input.sellerId, input.listingId);
    if (!l) return { ok: false as const, reason: "NOT_FOUND" as const };
    if (l.status !== "DRAFT" || l.publishedAt !== null) return { ok: false as const, reason: "NOT_A_DRAFT" as const };
    const photos = await tx.select({ key: listingPhotos.storageKey }).from(listingPhotos).where(eq(listingPhotos.listingId, l.id));
    await tx.delete(listings).where(eq(listings.id, l.id)); // photos cascade
    return { ok: true as const, storageKeys: photos.map((p) => p.key).filter((k): k is string => k !== null) };
  });
}

// ---------------------------------------------------------------------------
// Reads for the seller workspace
// ---------------------------------------------------------------------------

export const SELLER_TABS = {
  draft: ["DRAFT"],
  live: ["AVAILABLE"],
  reserved: ["RESERVED", "PAYMENT_PENDING"],
  "coming-soon": ["SCHEDULED"],
  sold: ["SOLD", "SOLD_ELSEWHERE"],
  withdrawn: ["WITHDRAWN"],
} as const satisfies Record<string, Listing["status"][]>;
export type SellerTab = keyof typeof SELLER_TABS;

export async function getSellerListing(db: Db, input: { sellerId: string; listingId: string }) {
  const [l] = await db
    .select()
    .from(listings)
    .where(and(eq(listings.id, input.listingId), eq(listings.sellerId, input.sellerId)));
  if (!l) return null;
  const photos = await db
    .select()
    .from(listingPhotos)
    .where(eq(listingPhotos.listingId, l.id))
    .orderBy(asc(listingPhotos.position));
  return { listing: l, photos, readiness: readinessOf(l, photos.map((p) => p.kind)) };
}

export async function getSellerListings(db: Db, input: { sellerId: string; tab: SellerTab }) {
  const rows = await db
    .select({
      listing: listings,
      coverUrl: sql<string | null>`(
        SELECT ${listingPhotos.url} FROM ${listingPhotos}
        WHERE ${listingPhotos.listingId} = ${listings.id} ORDER BY ${listingPhotos.position} LIMIT 1)`,
    })
    .from(listings)
    .where(and(eq(listings.sellerId, input.sellerId), inArray(listings.status, [...SELLER_TABS[input.tab]])))
    .orderBy(sql`${listings.updatedAt} DESC`)
    .limit(100);
  return rows.map((r) => ({ ...r.listing, coverUrl: r.coverUrl }));
}

export async function getSellerTabCounts(db: Db, sellerId: string) {
  const rows = await db
    .select({ status: listings.status, n: sql<number>`count(*)::int` })
    .from(listings)
    .where(eq(listings.sellerId, sellerId))
    .groupBy(listings.status);
  const by = new Map(rows.map((r) => [r.status, r.n]));
  return Object.fromEntries(
    Object.entries(SELLER_TABS).map(([tab, statuses]) => [tab, statuses.reduce((t, s) => t + (by.get(s) ?? 0), 0)]),
  ) as Record<SellerTab, number>;
}
