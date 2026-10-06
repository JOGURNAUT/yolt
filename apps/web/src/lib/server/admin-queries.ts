import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { LIVE_LISTING_STATUSES } from "@yolt/core";
import { auditEvents, claims, listingPhotos, listings, orders, refunds, sellerApplications, sellers, users } from "@yolt/db";
import { db } from "./db";

/**
 * Counts for the admin nav and overview. The core `getAdminCounts` has no dispatch or application
 * numbers, so these come from one extra query here.
 */
export async function getAdminDashboardCounts() {
  const [row] = await db.execute<{
    to_dispatch: number;
    late_dispatch: number;
    escalated_reports: number;
    failed_refunds: number;
    open_refunds: number;
    new_applications: number;
  }>(sql`SELECT
    (SELECT count(*)::int FROM ${orders} WHERE status IN ('CONFIRMED', 'PACKED')) AS to_dispatch,
    (SELECT count(*)::int FROM ${orders} WHERE status IN ('CONFIRMED', 'PACKED') AND dispatch_by < now()) AS late_dispatch,
    (SELECT count(*)::int FROM ${claims} WHERE status = 'ESCALATED') AS escalated_reports,
    (SELECT count(*)::int FROM ${refunds} WHERE status = 'FAILED') AS failed_refunds,
    (SELECT count(*)::int FROM ${refunds} WHERE status IN ('REQUESTED', 'PROCESSING', 'FAILED')) AS open_refunds,
    (SELECT count(*)::int FROM ${sellerApplications} WHERE status = 'NEW') AS new_applications`);
  return row!;
}

/** Applications per status, for the tabs on the Sellers page. */
export async function getApplicationCounts() {
  const rows = await db.select({ status: sellerApplications.status, n: sql<number>`count(*)::int` }).from(sellerApplications).groupBy(sellerApplications.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<"NEW" | "CONTACTED" | "ONBOARDED" | "REJECTED", number>>;
}

/** The audit log with who did each thing: staff name or the last digits of their phone. */
export async function getAuditLog(limit = 200) {
  return db
    .select({ event: auditEvents, actorName: users.name, actorPhone: users.phone })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
}

export type CurationPiece = { id: string; title: string; pricePaise: number | null; tagSize: string | null; coverUrl: string | null; sellerName: string };

/**
 * What staff can pick from for the homepage: approved stores and live pieces (newest 400, enough
 * to find anything in a pilot catalogue). The API re-checks liveness on every save.
 */
export async function getCurationCandidates() {
  const [stores, pieces] = await Promise.all([
    db.select({ id: sellers.id, name: sellers.displayName, handle: sellers.handle }).from(sellers).where(eq(sellers.status, "APPROVED")).orderBy(sellers.displayName),
    db
      .select({
        id: listings.id,
        title: listings.title,
        pricePaise: listings.pricePaise,
        tagSize: listings.tagSize,
        sellerName: sellers.displayName,
        coverUrl: sql<string | null>`(SELECT lp.url FROM ${listingPhotos} lp WHERE lp.listing_id = ${listings}.id ORDER BY lp.position LIMIT 1)`,
      })
      .from(listings)
      .innerJoin(sellers, eq(sellers.id, listings.sellerId))
      .where(and(inArray(listings.status, [...LIVE_LISTING_STATUSES]), eq(sellers.status, "APPROVED")))
      .orderBy(desc(listings.publishedAt))
      .limit(400),
  ]);
  return { stores, pieces: pieces.map((p): CurationPiece => ({ ...p, title: p.title ?? "Untitled" })) };
}

/** Title, price and photo for pieces already in a slot, whether or not they are still live. */
export async function getPiecesByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select({
      id: listings.id,
      title: listings.title,
      status: listings.status,
      pricePaise: listings.pricePaise,
      sellerName: sellers.displayName,
      coverUrl: sql<string | null>`(SELECT lp.url FROM ${listingPhotos} lp WHERE lp.listing_id = ${listings}.id ORDER BY lp.position LIMIT 1)`,
    })
    .from(listings)
    .innerJoin(sellers, eq(sellers.id, listings.sellerId))
    .where(inArray(listings.id, ids));
}
