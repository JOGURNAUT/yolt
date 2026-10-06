import "server-only";
import { sql } from "drizzle-orm";
import { claims, orders, refunds, sellerApplications } from "@yolt/db";
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
