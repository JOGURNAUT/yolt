import { and, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { auditEvents, homepageSlots, listings, sellers, type Db, type Tx } from "@yolt/db";

/**
 * Homepage curation (docs/design-plan.md, batch 10): staff pick the featured store, the Grails
 * list and the hero "edit". A slot is current when now is inside its optional window; when several
 * are current for a kind, the most recently created one wins. Every write needs a reason and is
 * audited, like the other admin actions.
 */

export type HomepageSlot = typeof homepageSlots.$inferSelect;
export type SlotKind = HomepageSlot["kind"];

export const MAX_SLOT_LISTINGS = 12;
export const EDIT_TITLE_LENGTH = { min: 3, max: 40 } as const;
/** Pieces a buyer can still act on. PAYMENT_PENDING is shown to buyers as "reserved", so it counts. */
export const LIVE_LISTING_STATUSES = ["AVAILABLE", "RESERVED", "PAYMENT_PENDING"] as const;

const reasonOk = (r: string) => r.trim().length >= 5;

export type SlotFields = {
  sellerId: string | null;
  title: string | null;
  listingIds: string[];
  startsAt: Date | null;
  endsAt: Date | null;
};

export type SlotFailure =
  | { ok: false; reason: "REASON_REQUIRED" | "NOT_FOUND" | "STORE_NOT_APPROVED" }
  | { ok: false; reason: "INVALID"; field: "sellerId" | "title" | "listingIds" | "window" }
  | { ok: false; reason: "LISTINGS_NOT_LIVE"; listingIds: string[] };

/** The slot as it would be saved: checks its shape per kind, then that the store and pieces are real. */
async function validateSlot(tx: Db | Tx, kind: SlotKind, f: SlotFields): Promise<SlotFailure | { ok: true; fields: SlotFields }> {
  if (f.startsAt && f.endsAt && f.endsAt.getTime() <= f.startsAt.getTime()) return { ok: false, reason: "INVALID", field: "window" };
  if (f.startsAt && Number.isNaN(f.startsAt.getTime())) return { ok: false, reason: "INVALID", field: "window" };
  if (f.endsAt && Number.isNaN(f.endsAt.getTime())) return { ok: false, reason: "INVALID", field: "window" };

  if (kind === "FEATURED_STORE") {
    if (!f.sellerId) return { ok: false, reason: "INVALID", field: "sellerId" };
    if (f.listingIds.length || f.title) return { ok: false, reason: "INVALID", field: f.title ? "title" : "listingIds" };
    const [s] = await tx.select({ status: sellers.status }).from(sellers).where(eq(sellers.id, f.sellerId));
    if (!s || s.status !== "APPROVED") return { ok: false, reason: "STORE_NOT_APPROVED" };
    return { ok: true, fields: { ...f, title: null } };
  }

  if (f.sellerId) return { ok: false, reason: "INVALID", field: "sellerId" };
  const ids = f.listingIds;
  if (ids.length < 1 || ids.length > MAX_SLOT_LISTINGS || new Set(ids).size !== ids.length) {
    return { ok: false, reason: "INVALID", field: "listingIds" };
  }
  let title: string | null = null;
  if (kind === "EDIT") {
    title = (f.title ?? "").replace(/\s+/g, " ").trim();
    if (title.length < EDIT_TITLE_LENGTH.min || title.length > EDIT_TITLE_LENGTH.max) return { ok: false, reason: "INVALID", field: "title" };
  } else if (f.title) {
    return { ok: false, reason: "INVALID", field: "title" };
  }

  const live = await tx
    .select({ id: listings.id })
    .from(listings)
    .innerJoin(sellers, eq(sellers.id, listings.sellerId))
    .where(and(inArray(listings.id, ids), inArray(listings.status, [...LIVE_LISTING_STATUSES]), eq(sellers.status, "APPROVED")));
  const liveIds = new Set(live.map((l) => l.id));
  const notLive = ids.filter((id) => !liveIds.has(id));
  if (notLive.length) return { ok: false, reason: "LISTINGS_NOT_LIVE", listingIds: notLive };
  return { ok: true, fields: { ...f, title } };
}

const snapshot = (s: HomepageSlot) => ({
  kind: s.kind,
  sellerId: s.sellerId,
  title: s.title,
  listingIds: s.listingIds,
  startsAt: s.startsAt?.toISOString() ?? null,
  endsAt: s.endsAt?.toISOString() ?? null,
});

export type SlotResult = { ok: true; slot: HomepageSlot } | SlotFailure;

export async function createSlot(
  db: Db,
  input: { adminUserId: string; kind: SlotKind; reason: string; now?: Date } & Partial<SlotFields>,
): Promise<SlotResult> {
  if (!reasonOk(input.reason)) return { ok: false, reason: "REASON_REQUIRED" };
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const v = await validateSlot(tx, input.kind, {
      sellerId: input.sellerId ?? null,
      title: input.title ?? null,
      listingIds: input.listingIds ?? [],
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
    });
    if (!v.ok) return v;
    const [slot] = await tx
      .insert(homepageSlots)
      .values({ kind: input.kind, ...v.fields, createdBy: input.adminUserId, createdAt: now, updatedAt: now })
      .returning();
    await tx.insert(auditEvents).values({
      actorId: input.adminUserId,
      actorRole: "admin",
      action: "homepage_slot.created",
      entity: "homepage_slot",
      entityId: slot!.id,
      after: snapshot(slot!),
      reason: input.reason,
    });
    return { ok: true, slot: slot! } as const;
  });
}

/** Changes the given fields (undefined keeps the current value; null clears). The kind never changes. */
export async function updateSlot(
  db: Db,
  input: { adminUserId: string; slotId: string; reason: string; patch: Partial<SlotFields>; now?: Date },
): Promise<SlotResult> {
  if (!reasonOk(input.reason)) return { ok: false, reason: "REASON_REQUIRED" };
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(homepageSlots).where(eq(homepageSlots.id, input.slotId)).for("update");
    if (!before) return { ok: false, reason: "NOT_FOUND" } as const;
    const p = input.patch;
    const v = await validateSlot(tx, before.kind, {
      sellerId: p.sellerId !== undefined ? p.sellerId : before.sellerId,
      title: p.title !== undefined ? p.title : before.title,
      listingIds: p.listingIds ?? before.listingIds,
      startsAt: p.startsAt !== undefined ? p.startsAt : before.startsAt,
      endsAt: p.endsAt !== undefined ? p.endsAt : before.endsAt,
    });
    if (!v.ok) return v;
    const [slot] = await tx.update(homepageSlots).set({ ...v.fields, updatedAt: now }).where(eq(homepageSlots.id, before.id)).returning();
    await tx.insert(auditEvents).values({
      actorId: input.adminUserId,
      actorRole: "admin",
      action: "homepage_slot.updated",
      entity: "homepage_slot",
      entityId: before.id,
      before: snapshot(before),
      after: snapshot(slot!),
      reason: input.reason,
    });
    return { ok: true, slot: slot! } as const;
  });
}

export async function deleteSlot(
  db: Db,
  input: { adminUserId: string; slotId: string; reason: string },
): Promise<{ ok: true } | { ok: false; reason: "REASON_REQUIRED" | "NOT_FOUND" }> {
  if (!reasonOk(input.reason)) return { ok: false, reason: "REASON_REQUIRED" };
  return db.transaction(async (tx) => {
    const [removed] = await tx.delete(homepageSlots).where(eq(homepageSlots.id, input.slotId)).returning();
    if (!removed) return { ok: false, reason: "NOT_FOUND" } as const;
    await tx.insert(auditEvents).values({
      actorId: input.adminUserId,
      actorRole: "admin",
      action: "homepage_slot.deleted",
      entity: "homepage_slot",
      entityId: removed.id,
      before: snapshot(removed),
      reason: input.reason,
    });
    return { ok: true } as const;
  });
}

/** The slot a visitor sees for a kind: current now, newest created first. */
export async function currentSlot(db: Db, kind: SlotKind, now = new Date()): Promise<HomepageSlot | null> {
  const [slot] = await db
    .select()
    .from(homepageSlots)
    .where(
      and(
        eq(homepageSlots.kind, kind),
        or(isNull(homepageSlots.startsAt), lte(homepageSlots.startsAt, now)),
        or(isNull(homepageSlots.endsAt), gt(homepageSlots.endsAt, now)),
      ),
    )
    .orderBy(desc(homepageSlots.createdAt), desc(homepageSlots.id))
    .limit(1);
  return slot ?? null;
}

export type SlotState = "CURRENT" | "UPCOMING" | "EXPIRED";

/** Every slot, newest first, with whether it is live now and whether it is the one shown (`winning`). */
export async function listSlots(db: Db, now = new Date()) {
  const rows = await db
    .select({ slot: homepageSlots, sellerName: sellers.displayName, sellerHandle: sellers.handle })
    .from(homepageSlots)
    .leftJoin(sellers, eq(sellers.id, homepageSlots.sellerId))
    .orderBy(desc(homepageSlots.createdAt), desc(homepageSlots.id));
  const seen = new Set<SlotKind>();
  return rows.map((r) => {
    const { startsAt, endsAt } = r.slot;
    const state: SlotState = startsAt && startsAt > now ? "UPCOMING" : endsAt && endsAt <= now ? "EXPIRED" : "CURRENT";
    // Rows are newest first, so the first current row of a kind is the winner.
    const winning = state === "CURRENT" && !seen.has(r.slot.kind);
    if (state === "CURRENT") seen.add(r.slot.kind);
    return { ...r, state, winning };
  });
}

