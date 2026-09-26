import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { listingPhotos, listings, sellers } from "@yolt/db";
import {
  addPhoto,
  createCheckout,
  createDraft,
  deleteDraft,
  getSellerListing,
  getSellerTabCounts,
  publishListing,
  removePhoto,
  reorderPhotos,
  updateListing,
  withdrawListing,
} from "../src";
import { createSeller, createUser, testDb, truncateAll } from "./fixtures";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));

const completePatch = {
  title: "Vintage Levi's 501",
  category: "jeans",
  tagSize: "W32 L32",
  measurements: { basis: "FLAT" as const, waistCm: 41, lengthCm: 104 },
  condition: "GOOD" as const,
  noFlawsConfirmed: true,
  pricePaise: 129900,
};

let n = 0;
async function photo(sellerId: string, listingId: string, kind: "FRONT" | "BACK" | "LABEL" | "FLAW") {
  n++;
  const r = await addPhoto(db, { sellerId, listingId, kind, url: `https://media.test/${n}.webp`, storageKey: `k/${n}.webp`, width: 1200, height: 1500 });
  if (!r.ok) throw new Error(r.reason);
  return r.photo;
}

async function readyDraft() {
  const { seller, owner } = await createSeller(db);
  const draft = await createDraft(db, { sellerId: seller.id });
  await updateListing(db, { sellerId: seller.id, listingId: draft.id, patch: completePatch });
  for (const kind of ["FRONT", "BACK", "LABEL"] as const) await photo(seller.id, draft.id, kind);
  return { seller, owner, draft };
}

describe("drafts and publishing", () => {
  it("an empty draft is allowed but can't be published, and says what's missing", async () => {
    const { seller, owner } = await createSeller(db);
    const draft = await createDraft(db, { sellerId: seller.id });
    expect(draft.status).toBe("DRAFT");

    const r = await publishListing(db, { sellerId: seller.id, listingId: draft.id, actorUserId: owner.id });
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "INCOMPLETE") {
      expect(r.missing.map((m) => m.field)).toEqual(expect.arrayContaining(["title", "category", "price", "photos", "flaws"]));
    } else throw new Error("expected INCOMPLETE");
  });

  it("publishes a complete draft with a readable slug", async () => {
    const { seller, owner, draft } = await readyDraft();
    const r = await publishListing(db, { sellerId: seller.id, listingId: draft.id, actorUserId: owner.id });
    expect(r.ok && r.slug).toMatch(/^vintage-levis-501-[0-9a-f]{6}$/);
    const [l] = await db.select().from(listings).where(eq(listings.id, draft.id));
    expect(l!.status).toBe("AVAILABLE");
    expect(l!.publishedAt).not.toBeNull();
  });

  it("requires a verified seller to publish", async () => {
    const { seller, owner, draft } = await readyDraft();
    await db.update(sellers).set({ kycStatus: "PENDING" }).where(eq(sellers.id, seller.id));
    expect(await publishListing(db, { sellerId: seller.id, listingId: draft.id, actorUserId: owner.id })).toEqual({
      ok: false,
      reason: "SELLER_NOT_VERIFIED",
    });
  });

  it("the database itself refuses an incomplete non-draft listing", async () => {
    const { seller } = await createSeller(db);
    const draft = await createDraft(db, { sellerId: seller.id });
    await expect(db.update(listings).set({ status: "AVAILABLE" }).where(eq(listings.id, draft.id))).rejects.toThrow();
  });

  it("sellers can't see or touch another seller's listings", async () => {
    const { draft } = await readyDraft();
    const { seller: other, owner: otherOwner } = await createSeller(db);
    expect(await getSellerListing(db, { sellerId: other.id, listingId: draft.id })).toBeNull();
    expect((await updateListing(db, { sellerId: other.id, listingId: draft.id, patch: { title: "Mine now" } })).ok).toBe(false);
    expect((await publishListing(db, { sellerId: other.id, listingId: draft.id, actorUserId: otherOwner.id })).ok).toBe(false);
    expect((await deleteDraft(db, { sellerId: other.id, listingId: draft.id })).ok).toBe(false);
  });
});

describe("editing rules", () => {
  it("a live listing can be edited but not into an incomplete state", async () => {
    const { seller, owner, draft } = await readyDraft();
    await publishListing(db, { sellerId: seller.id, listingId: draft.id, actorUserId: owner.id });

    expect((await updateListing(db, { sellerId: seller.id, listingId: draft.id, patch: { pricePaise: 99900 } })).ok).toBe(true);
    const broken = await updateListing(db, { sellerId: seller.id, listingId: draft.id, patch: { tagSize: null } });
    expect(broken).toMatchObject({ ok: false, reason: "WOULD_BREAK_LIVE_LISTING" });
  });

  it("describing a flaw on a live listing requires a flaw photo first", async () => {
    const { seller, owner, draft } = await readyDraft();
    await publishListing(db, { sellerId: seller.id, listingId: draft.id, actorUserId: owner.id });
    const r = await updateListing(db, {
      sellerId: seller.id,
      listingId: draft.id,
      patch: { flaws: "Small hole on sleeve", noFlawsConfirmed: false },
    });
    expect(r).toMatchObject({ ok: false, reason: "WOULD_BREAK_LIVE_LISTING" });
  });

  it("an item a buyer is checking out is frozen", async () => {
    const { seller, owner, draft } = await readyDraft();
    await publishListing(db, { sellerId: seller.id, listingId: draft.id, actorUserId: owner.id });
    const buyer = await createUser(db);
    await createCheckout(db, { buyerId: buyer.id, listingIds: [draft.id] });

    expect(await updateListing(db, { sellerId: seller.id, listingId: draft.id, patch: { pricePaise: 1 } })).toEqual({
      ok: false,
      reason: "NOT_EDITABLE",
    });
    expect(await withdrawListing(db, { sellerId: seller.id, listingId: draft.id, actorUserId: owner.id })).toEqual({
      ok: false,
      reason: "BUYER_CHECKING_OUT",
    });
  });

  it("withdraw and relist keeps the slug and first publish date", async () => {
    const { seller, owner, draft } = await readyDraft();
    const first = await publishListing(db, { sellerId: seller.id, listingId: draft.id, actorUserId: owner.id });
    const [before] = await db.select().from(listings).where(eq(listings.id, draft.id));
    expect((await withdrawListing(db, { sellerId: seller.id, listingId: draft.id, actorUserId: owner.id })).ok).toBe(true);
    const again = await publishListing(db, { sellerId: seller.id, listingId: draft.id, actorUserId: owner.id });
    expect(again.ok && again.slug).toBe(first.ok && first.slug);
    const [after] = await db.select().from(listings).where(eq(listings.id, draft.id));
    expect(after!.publishedAt).toEqual(before!.publishedAt);
  });

  it("only never-published drafts can be deleted", async () => {
    const { seller, owner, draft } = await readyDraft();
    await publishListing(db, { sellerId: seller.id, listingId: draft.id, actorUserId: owner.id });
    await withdrawListing(db, { sellerId: seller.id, listingId: draft.id, actorUserId: owner.id });
    expect(await deleteDraft(db, { sellerId: seller.id, listingId: draft.id })).toEqual({ ok: false, reason: "NOT_A_DRAFT" });

    const fresh = await createDraft(db, { sellerId: seller.id });
    await photo(seller.id, fresh.id, "FRONT");
    const r = await deleteDraft(db, { sellerId: seller.id, listingId: fresh.id });
    expect(r.ok && r.storageKeys).toHaveLength(1);
  });
});

describe("photos", () => {
  it("appends photos in order and reorders them (first is the cover)", async () => {
    const { seller, draft } = await readyDraft();
    const g = await getSellerListing(db, { sellerId: seller.id, listingId: draft.id });
    const ids = g!.photos.map((p) => p.id);
    expect(g!.photos.map((p) => p.kind)).toEqual(["FRONT", "BACK", "LABEL"]);

    expect(await reorderPhotos(db, { sellerId: seller.id, listingId: draft.id, photoIds: [ids[2]!, ids[0]!, ids[1]!] })).toEqual({ ok: true });
    const after = await getSellerListing(db, { sellerId: seller.id, listingId: draft.id });
    expect(after!.photos.map((p) => p.kind)).toEqual(["LABEL", "FRONT", "BACK"]);

    expect(await reorderPhotos(db, { sellerId: seller.id, listingId: draft.id, photoIds: [ids[0]!] })).toEqual({
      ok: false,
      reason: "PHOTO_SET_MISMATCH",
    });
  });

  it("removing a photo compacts positions and returns the storage key", async () => {
    const { seller, draft } = await readyDraft();
    const g = await getSellerListing(db, { sellerId: seller.id, listingId: draft.id });
    const r = await removePhoto(db, { sellerId: seller.id, listingId: draft.id, photoId: g!.photos[0]!.id });
    expect(r.ok && r.storageKey).toMatch(/^k\//);
    const rows = await db.select().from(listingPhotos).where(eq(listingPhotos.listingId, draft.id));
    expect(rows.map((p) => p.position).sort()).toEqual([0, 1]);
  });

  it("a live listing can't lose a required photo", async () => {
    const { seller, owner, draft } = await readyDraft();
    await publishListing(db, { sellerId: seller.id, listingId: draft.id, actorUserId: owner.id });
    const g = await getSellerListing(db, { sellerId: seller.id, listingId: draft.id });
    const label = g!.photos.find((p) => p.kind === "LABEL")!;
    expect(await removePhoto(db, { sellerId: seller.id, listingId: draft.id, photoId: label.id })).toMatchObject({
      ok: false,
      reason: "WOULD_BREAK_LIVE_LISTING",
    });
  });

  it("caps photos per listing", async () => {
    const { seller } = await createSeller(db);
    const draft = await createDraft(db, { sellerId: seller.id });
    for (let i = 0; i < 12; i++) await photo(seller.id, draft.id, "FRONT");
    const r = await addPhoto(db, { sellerId: seller.id, listingId: draft.id, kind: "FRONT", url: "u", storageKey: "k", width: 1, height: 1 });
    expect(r).toEqual({ ok: false, reason: "TOO_MANY_PHOTOS" });
  });

  it("counts listings per workspace tab", async () => {
    const { seller, owner, draft } = await readyDraft();
    await createDraft(db, { sellerId: seller.id });
    await publishListing(db, { sellerId: seller.id, listingId: draft.id, actorUserId: owner.id });
    expect(await getSellerTabCounts(db, seller.id)).toMatchObject({ draft: 1, live: 1, sold: 0 });
  });
});
