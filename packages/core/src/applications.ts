import { desc, eq, or, and, inArray, sql } from "drizzle-orm";
import { APPLICATION_VOLUMES, normalizeIndianMobile, normalizeInstagramHandle, type ApplicationVolume } from "@yolt/shared";
import { auditEvents, outboxEvents, sellerApplications, users, type Db } from "@yolt/db";
import type { AuthSecrets } from "./auth";
import { hitRateLimit, rateLimitKey } from "./ratelimit";

/**
 * "Apply to sell" (docs/user-flows.md S-F1, the /sell form). Open to guests. Staff review the
 * queue, call the seller and onboard them by hand during the pilot (admin.ts `onboardSeller`).
 */

export type Application = typeof sellerApplications.$inferSelect;
export type ApplicationStatus = Application["status"];

export const APPLY_MAX_PER_IP_PER_HOUR = 5;
export const APPLY_MAX_PER_PHONE_PER_HOUR = 3;
const OPEN: ApplicationStatus[] = ["NEW", "CONTACTED"];

export type ApplyInput = {
  storeName: string;
  instagramHandle: string;
  city: string;
  whatTheySell: string;
  piecesPerMonth: string;
  phone: string;
  /** Set when the applicant is signed in. */
  userId?: string | null;
  ip?: string | null;
  now?: Date;
};

export type ApplyResult =
  | { ok: true; created: boolean; id: string; status: ApplicationStatus }
  | { ok: false; reason: "INVALID"; field: "storeName" | "instagramHandle" | "city" | "whatTheySell" | "piecesPerMonth" | "phone" }
  | { ok: false; reason: "RATE_LIMITED"; retryAfterSeconds: number };

const clean = (v: string) => v.replace(/\s+/g, " ").trim();

/**
 * Creates an application, or returns the open one this phone or Instagram handle already has.
 * Rate limited per network and per phone; every attempt counts, including repeats.
 */
export async function applyToSell(db: Db, secrets: AuthSecrets, input: ApplyInput): Promise<ApplyResult> {
  const now = input.now ?? new Date();
  const storeName = clean(input.storeName);
  const city = clean(input.city);
  const whatTheySell = clean(input.whatTheySell);
  const handle = normalizeInstagramHandle(input.instagramHandle);
  const phone = normalizeIndianMobile(input.phone);
  if (storeName.length < 2 || storeName.length > 80) return { ok: false, reason: "INVALID", field: "storeName" };
  if (!handle) return { ok: false, reason: "INVALID", field: "instagramHandle" };
  if (city.length < 2 || city.length > 80) return { ok: false, reason: "INVALID", field: "city" };
  if (whatTheySell.length < 5 || whatTheySell.length > 500) return { ok: false, reason: "INVALID", field: "whatTheySell" };
  if (!(APPLICATION_VOLUMES as readonly string[]).includes(input.piecesPerMonth)) return { ok: false, reason: "INVALID", field: "piecesPerMonth" };
  if (!phone) return { ok: false, reason: "INVALID", field: "phone" };

  const limits = [
    ...(input.ip ? [{ key: rateLimitKey(secrets, "apply-ip", input.ip), limit: APPLY_MAX_PER_IP_PER_HOUR }] : []),
    { key: rateLimitKey(secrets, "apply-phone", phone), limit: APPLY_MAX_PER_PHONE_PER_HOUR },
  ];
  for (const l of limits) {
    const r = await hitRateLimit(db, { ...l, windowSeconds: 3600, now });
    if (!r.ok) return { ok: false, reason: "RATE_LIMITED", retryAfterSeconds: r.retryAfterSeconds };
  }

  return db.transaction(async (tx) => {
    // Serialise on phone and handle (in a fixed order) so two submissions can't both create a row.
    for (const k of [`apply:phone:${phone}`, `apply:ig:${handle}`].sort()) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${k}))`);
    const [existing] = await tx
      .select({ id: sellerApplications.id, status: sellerApplications.status })
      .from(sellerApplications)
      .where(and(inArray(sellerApplications.status, OPEN), or(eq(sellerApplications.phone, phone), eq(sellerApplications.instagramHandle, handle))))
      .orderBy(desc(sellerApplications.createdAt))
      .limit(1);
    if (existing) return { ok: true, created: false, id: existing.id, status: existing.status } as const;

    const [created] = await tx
      .insert(sellerApplications)
      .values({
        storeName,
        instagramHandle: handle,
        city,
        whatTheySell,
        piecesPerMonth: input.piecesPerMonth as ApplicationVolume,
        phone,
        userId: input.userId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: sellerApplications.id, status: sellerApplications.status });
    await tx.insert(outboxEvents).values({ type: "seller_application.created", payload: { applicationId: created!.id } });
    return { ok: true, created: true, id: created!.id, status: created!.status } as const;
  });
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export async function listApplications(db: Db, input: { status?: ApplicationStatus } = {}) {
  return db
    .select({ application: sellerApplications, accountName: users.name })
    .from(sellerApplications)
    .leftJoin(users, eq(users.id, sellerApplications.userId))
    .where(input.status ? eq(sellerApplications.status, input.status) : undefined)
    .orderBy(desc(sellerApplications.createdAt))
    .limit(200);
}

export type UpdateApplicationResult =
  | { ok: true; application: Application }
  | { ok: false; reason: "NOT_FOUND" | "REASON_REQUIRED" | "NO_CHANGE" | "NOTE_TOO_LONG" | "OPEN_DUPLICATE_EXISTS" };

const isUniqueViolation = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
};

/** Moves an application along (NEW → CONTACTED → ONBOARDED or REJECTED) and may update the staff note. */
export async function updateApplicationStatus(
  db: Db,
  input: { adminUserId: string; applicationId: string; status: ApplicationStatus; note?: string | null; reason: string; now?: Date },
): Promise<UpdateApplicationResult> {
  if (input.reason.trim().length < 5) return { ok: false, reason: "REASON_REQUIRED" };
  const note = input.note === undefined ? undefined : (input.note?.trim() || null);
  if (note && note.length > 1000) return { ok: false, reason: "NOTE_TOO_LONG" };
  const now = input.now ?? new Date();
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(sellerApplications).where(eq(sellerApplications.id, input.applicationId)).for("update");
      if (!before) return { ok: false, reason: "NOT_FOUND" } as const;
      if (before.status === input.status && (note === undefined || note === before.adminNote)) return { ok: false, reason: "NO_CHANGE" } as const;
      const [application] = await tx
        .update(sellerApplications)
        .set({ status: input.status, ...(note !== undefined ? { adminNote: note } : {}), updatedAt: now })
        .where(eq(sellerApplications.id, before.id))
        .returning();
      await tx.insert(auditEvents).values({
        actorId: input.adminUserId,
        actorRole: "admin",
        action: "seller_application.status_changed",
        entity: "seller_application",
        entityId: before.id,
        before: { status: before.status, adminNote: before.adminNote },
        after: { status: application!.status, adminNote: application!.adminNote },
        reason: input.reason,
      });
      return { ok: true, application: application! } as const;
    });
  } catch (err) {
    // Reopening a rejected application when the same phone or handle has a newer open one.
    if (isUniqueViolation(err)) return { ok: false, reason: "OPEN_DUPLICATE_EXISTS" };
    throw err;
  }
}
