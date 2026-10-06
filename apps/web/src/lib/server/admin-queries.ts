import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { auditEvents, claims, orders, refunds, sellerApplications, users } from "@yolt/db";
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
