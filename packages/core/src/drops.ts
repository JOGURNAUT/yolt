import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { auditEvents, dropReminders, drops, listingPhotos, listings, outboxEvents, sellers, type Db, type Tx } from "@yolt/db";
import { readinessOf } from "./listings";
import { listingCardsByIds, type SearchHit } from "./search";

/**
 * Scheduled drops (docs/user-flows.md B-F7a, S-F5): items are locked and shown as Coming soon,
 * then open at a set time on the server's clock. Claiming uses the normal hold checkout with a
 * per-buyer limit (enforced in createCheckout).
 */

export type Drop = typeof drops.$inferSelect;
export const MIN_LEAD_MINUTES = 10;
const MAX_LEAD_DAYS = 60;
export const REMINDER_LEAD_MINUTES = 15;
/** Statuses an item can join a drop from. */
const JOINABLE = ["DRAFT", "AVAILABLE", "WITHDRAWN"] as const;

type Fail<R extends string> = { ok: false; reason: R };

// ---------------------------------------------------------------------------
// Opening (used by the cron sweep and, lazily, by checkout and drop page reads)
// ---------------------------------------------------------------------------

/**
 * Opens a scheduled drop whose time has come: items become AVAILABLE with the drop's start as
 * their publish time. Idempotent and safe to call concurrently (conditional updates).
 */
export async function openDropIfDue(tx: Tx, dropId: string, now: Date) {
  const opened = await tx
    .update(drops)
    .set({ status: "LIVE", openedAt: now })
    .where(and(eq(drops.id, dropId), eq(drops.status, "SCHEDULED"), lte(drops.startsAt, now)))
    .returning({ id: drops.id, startsAt: drops.startsAt });
  if (opened.length === 0) return false;
  await tx
    .update(listings)
    .set({ status: "AVAILABLE", publishedAt: opened[0]!.startsAt, updatedAt: now })
    .where(and(eq(listings.dropId, dropId), eq(listings.status, "SCHEDULED")));
  await tx.insert(outboxEvents).values({ type: "drop.opened", payload: { dropId } });
  return true;
}

export async function openDueDrops(db: Db, opts: { now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const due = await db
    .select({ id: drops.id })
    .from(drops)
    .where(and(eq(drops.status, "SCHEDULED"), lte(drops.startsAt, now)));
  let opened = 0;
  for (const d of due) if (await db.transaction((tx) => openDropIfDue(tx, d.id, now))) opened++;
  return { opened };
}

/** Queues the "starting soon" reminder once per drop, 15 minutes before it opens. */
export async function queueDropReminders(db: Db, opts: { now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const soon = new Date(now.getTime() + REMINDER_LEAD_MINUTES * 60_000);
  return db.transaction(async (tx) => {
    const queued = await tx
      .update(drops)
      .set({ remindersQueuedAt: now })
      .where(and(eq(drops.status, "SCHEDULED"), lte(drops.startsAt, soon), sql`${drops.remindersQueuedAt} IS NULL`))
      .returning({ id: drops.id });
    for (const d of queued) {
      const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(dropReminders).where(eq(dropReminders.dropId, d.id))) as [{ n: number }];
      await tx.insert(outboxEvents).values({ type: "drop.starting_soon", payload: { dropId: d.id, reminders: n } });
    }
    return { queued: queued.length };
  });
}

/** A live drop with nothing left to buy or pay for is over. */
export async function endFinishedDrops(db: Db) {
  const ended = await db
    .update(drops)
    .set({ status: "ENDED" })
    .where(
      and(
        eq(drops.status, "LIVE"),
        sql`NOT EXISTS (SELECT 1 FROM ${listings} l WHERE l.drop_id = ${drops}.id AND l.status IN ('AVAILABLE', 'RESERVED', 'PAYMENT_PENDING'))`,
      ),
    )
    .returning({ id: drops.id });
  return { ended: ended.length };
}

// ---------------------------------------------------------------------------
// Seller: build and schedule
// ---------------------------------------------------------------------------

function checkStart(startsAt: Date, now: Date) {
  if (Number.isNaN(startsAt.getTime())) return "INVALID_TIME" as const;
  if (startsAt.getTime() < now.getTime() + MIN_LEAD_MINUTES * 60_000) return "TOO_SOON" as const;
  if (startsAt.getTime() > now.getTime() + MAX_LEAD_DAYS * 86_400_000) return "TOO_FAR" as const;
  return null;
}

export async function createDrop(
  db: Db,
  input: { sellerId: string; title: string; startsAt: Date; maxHoldsPerBuyer: 1 | 2; now?: Date },
): Promise<{ ok: true; dropId: string } | Fail<"INVALID_TITLE" | "INVALID_TIME" | "TOO_SOON" | "TOO_FAR">> {
  const now = input.now ?? new Date();
  const title = input.title.trim();
  if (title.length < 3 || title.length > 80) return { ok: false, reason: "INVALID_TITLE" };
  const bad = checkStart(input.startsAt, now);
  if (bad) return { ok: false, reason: bad };
  const [d] = await db
    .insert(drops)
    .values({ sellerId: input.sellerId, title, startsAt: input.startsAt, maxHoldsPerBuyer: input.maxHoldsPerBuyer, status: "DRAFT" })
    .returning({ id: drops.id });
  return { ok: true, dropId: d!.id };
}

async function lockOwnDraftDrop(tx: Tx, sellerId: string, dropId: string) {
  const [d] = await tx
    .select()
    .from(drops)
    .where(and(eq(drops.id, dropId), eq(drops.sellerId, sellerId)))
    .for("update");
  return d ?? null;
}

export async function addListingToDrop(db: Db, input: { sellerId: string; dropId: string; listingId: string }) {
  return db.transaction(async (tx) => {
    const d = await lockOwnDraftDrop(tx, input.sellerId, input.dropId);
    if (!d) return { ok: false as const, reason: "NOT_FOUND" as const };
    if (d.status !== "DRAFT") return { ok: false as const, reason: "DROP_LOCKED" as const };
    const [l] = await tx
      .select()
      .from(listings)
      .where(and(eq(listings.id, input.listingId), eq(listings.sellerId, input.sellerId)))
      .for("update");
    if (!l) return { ok: false as const, reason: "NOT_FOUND" as const };
    if (l.dropId && l.dropId !== d.id) return { ok: false as const, reason: "IN_ANOTHER_DROP" as const };
    if (!(JOINABLE as readonly string[]).includes(l.status)) return { ok: false as const, reason: "NOT_JOINABLE" as const };
    const photos = await tx.select({ kind: listingPhotos.kind }).from(listingPhotos).where(eq(listingPhotos.listingId, l.id));
    const { missing } = readinessOf(l, photos.map((p) => p.kind));
    if (missing.length) return { ok: false as const, reason: "INCOMPLETE" as const, missing };
    await tx.update(listings).set({ dropId: d.id }).where(eq(listings.id, l.id));
    return { ok: true as const };
  });
}

export async function removeListingFromDrop(db: Db, input: { sellerId: string; dropId: string; listingId: string }) {
  return db.transaction(async (tx) => {
    const d = await lockOwnDraftDrop(tx, input.sellerId, input.dropId);
    if (!d) return { ok: false as const, reason: "NOT_FOUND" as const };
    if (d.status !== "DRAFT") return { ok: false as const, reason: "DROP_LOCKED" as const };
    await tx
      .update(listings)
      .set({ dropId: null })
      .where(and(eq(listings.id, input.listingId), eq(listings.sellerId, input.sellerId), eq(listings.dropId, d.id)));
    return { ok: true as const };
  });
}

export type ScheduleResult =
  | { ok: true; items: number }
  | Fail<"NOT_FOUND" | "NOT_DRAFT" | "EMPTY" | "SELLER_NOT_VERIFIED" | "TOO_SOON" | "INVALID_TIME" | "TOO_FAR">
  | { ok: false; reason: "ITEMS_CHANGED"; listingIds: string[] };

/** Locks the drop: every item becomes SCHEDULED (Coming soon) until it opens. All or nothing. */
export async function scheduleDrop(
  db: Db,
  input: { sellerId: string; dropId: string; actorUserId: string; now?: Date },
): Promise<ScheduleResult> {
  const now = input.now ?? new Date();
  class Abort extends Error {
    constructor(readonly result: ScheduleResult) {
      super("abort");
    }
  }
  try {
    return await db.transaction(async (tx) => {
      const [seller] = await tx.select().from(sellers).where(eq(sellers.id, input.sellerId));
      if (!seller || seller.status !== "APPROVED" || seller.kycStatus !== "VERIFIED") return { ok: false, reason: "SELLER_NOT_VERIFIED" } as const;
      const d = await lockOwnDraftDrop(tx, input.sellerId, input.dropId);
      if (!d) return { ok: false, reason: "NOT_FOUND" } as const;
      if (d.status !== "DRAFT") return { ok: false, reason: "NOT_DRAFT" } as const;
      const bad = checkStart(d.startsAt, now);
      if (bad) return { ok: false, reason: bad } as const;

      const items = await tx.select({ id: listings.id }).from(listings).where(eq(listings.dropId, d.id));
      if (items.length === 0) return { ok: false, reason: "EMPTY" } as const;
      // An item may have been reserved or sold since it was added; then nothing is scheduled.
      const moved = await tx
        .update(listings)
        .set({ status: "SCHEDULED", updatedAt: now })
        .where(and(eq(listings.dropId, d.id), inArray(listings.status, [...JOINABLE])))
        .returning({ id: listings.id });
      if (moved.length !== items.length) {
        const movedIds = new Set(moved.map((m) => m.id));
        throw new Abort({ ok: false, reason: "ITEMS_CHANGED", listingIds: items.map((i) => i.id).filter((id) => !movedIds.has(id)) });
      }
      await tx.update(drops).set({ status: "SCHEDULED" }).where(eq(drops.id, d.id));
      await tx.insert(outboxEvents).values({ type: "drop.scheduled", payload: { dropId: d.id } });
      await tx.insert(auditEvents).values({ actorId: input.actorUserId, actorRole: "seller", action: "drop.scheduled", entity: "drop", entityId: d.id });
      return { ok: true, items: items.length } as const;
    });
  } catch (err) {
    if (err instanceof Abort) return err.result;
    throw err;
  }
}

/** Cancel before it opens: items leave the drop and are withdrawn (the seller can relist them). */
export async function cancelDrop(db: Db, input: { sellerId: string; dropId: string; actorUserId: string; now?: Date }) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const d = await lockOwnDraftDrop(tx, input.sellerId, input.dropId);
    if (!d) return { ok: false as const, reason: "NOT_FOUND" as const };
    if (d.status !== "DRAFT" && d.status !== "SCHEDULED") return { ok: false as const, reason: "ALREADY_OPEN" as const };
    if (d.status === "SCHEDULED" && d.startsAt <= now) return { ok: false as const, reason: "ALREADY_OPEN" as const };
    await tx
      .update(listings)
      .set({ status: "WITHDRAWN", updatedAt: now })
      .where(and(eq(listings.dropId, d.id), eq(listings.status, "SCHEDULED")));
    await tx.update(listings).set({ dropId: null }).where(eq(listings.dropId, d.id));
    await tx.update(drops).set({ status: "CANCELLED" }).where(eq(drops.id, d.id));
    await tx.insert(auditEvents).values({ actorId: input.actorUserId, actorRole: "seller", action: "drop.cancelled", entity: "drop", entityId: d.id });
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export async function setDropReminder(db: Db, input: { userId: string; dropId: string; on: boolean }) {
  const [d] = await db.select({ status: drops.status }).from(drops).where(eq(drops.id, input.dropId));
  if (!d || (d.status !== "SCHEDULED" && d.status !== "LIVE")) return { ok: false as const, reason: "NOT_FOUND" as const };
  if (input.on) await db.insert(dropReminders).values({ userId: input.userId, dropId: input.dropId }).onConflictDoNothing();
  else await db.delete(dropReminders).where(and(eq(dropReminders.userId, input.userId), eq(dropReminders.dropId, input.dropId)));
  return { ok: true as const };
}

export async function hasDropReminder(db: Db, input: { userId: string; dropId: string }) {
  const [r] = await db
    .select({ dropId: dropReminders.dropId })
    .from(dropReminders)
    .where(and(eq(dropReminders.userId, input.userId), eq(dropReminders.dropId, input.dropId)));
  return Boolean(r);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type DropView = {
  drop: Pick<Drop, "id" | "title" | "startsAt" | "status" | "maxHoldsPerBuyer" | "coverUrl">;
  seller: { handle: string; displayName: string };
  items: SearchHit[];
  reminders: number;
};

/**
 * A public drop page (scheduled, live or ended; never drafts or cancelled). Opens the drop
 * first if its time has come, so the page never shows a stale "coming soon".
 */
export async function getDropView(db: Db, dropId: string, now = new Date()): Promise<DropView | null> {
  await db.transaction((tx) => openDropIfDue(tx, dropId, now));
  const [row] = await db
    .select({ drop: drops, handle: sellers.handle, displayName: sellers.displayName })
    .from(drops)
    .innerJoin(sellers, eq(sellers.id, drops.sellerId))
    .where(and(eq(drops.id, dropId), inArray(drops.status, ["SCHEDULED", "LIVE", "ENDED"]), eq(sellers.status, "APPROVED")));
  if (!row) return null;
  const ids = await db.select({ id: listings.id }).from(listings).where(eq(listings.dropId, dropId)).orderBy(asc(listings.createdAt));
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(dropReminders).where(eq(dropReminders.dropId, dropId))) as [{ n: number }];
  const d = row.drop;
  return {
    drop: { id: d.id, title: d.title, startsAt: d.startsAt, status: d.status, maxHoldsPerBuyer: d.maxHoldsPerBuyer, coverUrl: d.coverUrl },
    seller: { handle: row.handle, displayName: row.displayName },
    items: await listingCardsByIds(db, ids.map((i) => i.id)),
    reminders: n,
  };
}

/** Lightweight item states for the live page to poll. */
export async function getDropLiveState(db: Db, dropId: string, now = new Date()) {
  await db.transaction((tx) => openDropIfDue(tx, dropId, now));
  const [d] = await db.select({ status: drops.status, startsAt: drops.startsAt }).from(drops).where(eq(drops.id, dropId));
  if (!d || d.status === "DRAFT" || d.status === "CANCELLED") return null;
  const items = await db.select({ id: listings.id, status: listings.status }).from(listings).where(eq(listings.dropId, dropId));
  return { status: d.status, startsAt: d.startsAt, serverNow: now, items };
}

/** Upcoming and live drops from approved stores, soonest first. */
export async function listPublicDrops(db: Db) {
  return db
    .select({
      id: drops.id,
      title: drops.title,
      startsAt: drops.startsAt,
      status: drops.status,
      sellerHandle: sellers.handle,
      sellerName: sellers.displayName,
      items: sql<number>`(SELECT count(*)::int FROM ${listings} l WHERE l.drop_id = ${drops}.id)`,
    })
    .from(drops)
    .innerJoin(sellers, eq(sellers.id, drops.sellerId))
    .where(and(inArray(drops.status, ["SCHEDULED", "LIVE"]), eq(sellers.status, "APPROVED")))
    .orderBy(asc(drops.startsAt))
    .limit(50);
}

export async function listSellerDrops(db: Db, sellerId: string) {
  return db
    .select({
      drop: drops,
      items: sql<number>`(SELECT count(*)::int FROM ${listings} l WHERE l.drop_id = ${drops}.id)`,
      reminders: sql<number>`(SELECT count(*)::int FROM ${dropReminders} r WHERE r.drop_id = ${drops}.id)`,
    })
    .from(drops)
    .where(eq(drops.sellerId, sellerId))
    .orderBy(desc(drops.startsAt));
}

/**
 * A seller's own drop with its items and the listings that could still join it. Reads the
 * seller's rows directly, since drafts (hidden from buyers) are the usual drop candidates.
 */
export async function getSellerDrop(db: Db, input: { sellerId: string; dropId: string }) {
  const [d] = await db
    .select()
    .from(drops)
    .where(and(eq(drops.id, input.dropId), eq(drops.sellerId, input.sellerId)));
  if (!d) return null;
  const columns = {
    listing: listings,
    coverUrl: sql<string | null>`(SELECT lp.url FROM ${listingPhotos} lp WHERE lp.listing_id = ${listings}.id ORDER BY lp.position LIMIT 1)`,
  };
  const [items, candidates] = await Promise.all([
    db.select(columns).from(listings).where(eq(listings.dropId, d.id)).orderBy(asc(listings.createdAt)),
    db
      .select(columns)
      .from(listings)
      .where(and(eq(listings.sellerId, input.sellerId), sql`${listings.dropId} IS NULL`, inArray(listings.status, [...JOINABLE])))
      .orderBy(desc(listings.updatedAt))
      .limit(100),
  ]);
  const allIds = [...items, ...candidates].map((r) => r.listing.id);
  const photoKinds = allIds.length
    ? await db.select({ listingId: listingPhotos.listingId, kind: listingPhotos.kind }).from(listingPhotos).where(inArray(listingPhotos.listingId, allIds))
    : [];
  const kindsFor = (id: string) => photoKinds.filter((p) => p.listingId === id).map((p) => p.kind);
  const view = (r: (typeof items)[number]) => ({
    id: r.listing.id,
    title: r.listing.title ?? "Untitled draft",
    tagSize: r.listing.tagSize,
    pricePaise: r.listing.pricePaise,
    status: r.listing.status,
    coverUrl: r.coverUrl,
    ready: readinessOf(r.listing, kindsFor(r.listing.id)).ready,
  });
  return { drop: d, items: items.map(view), eligible: candidates.map(view) };
}
