import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { adminSessionFresh, getAdminRole } from "@yolt/core";
import { auditEvents, outboxEvents, refunds } from "@yolt/db";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/session";

/**
 * Retry a failed refund. There is no retry in the staff API (packages/api), so this route
 * applies the same rules as it does (signed in, staff, session under 12 h, ADMIN, a reason) and
 * queues the refund again the way a new one is queued: back to REQUESTED plus a refund.requested
 * event, with an audit record, in one transaction.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/admin/refunds/[id]/retry">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "SIGN_IN_REQUIRED" }, { status: 401 });
  const role = await getAdminRole(db, user.userId);
  if (!role) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!adminSessionFresh(user.sessionCreatedAt)) return NextResponse.json({ error: "REAUTH_REQUIRED" }, { status: 401 });
  if (role !== "ADMIN") return NextResponse.json({ error: "READ_ONLY_ROLE" }, { status: 403 });

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 5 || reason.length > 1000) return NextResponse.json({ error: "REASON_REQUIRED" }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const result = await db.transaction(async (tx) => {
    const [refund] = await tx.select().from(refunds).where(eq(refunds.id, id)).for("update");
    if (!refund) return "NOT_FOUND" as const;
    if (refund.status !== "FAILED") return "NOT_RETRYABLE" as const;
    await tx.update(refunds).set({ status: "REQUESTED", updatedAt: new Date() }).where(and(eq(refunds.id, id), eq(refunds.status, "FAILED")));
    await tx.insert(outboxEvents).values({ type: "refund.requested", payload: { refundId: id, orderId: refund.orderId, reason: refund.reason, retry: true } });
    await tx.insert(auditEvents).values({
      actorId: user.userId,
      actorRole: "admin",
      action: "refund.retry_requested",
      entity: "refund",
      entityId: id,
      before: { status: "FAILED" },
      after: { status: "REQUESTED" },
      reason,
    });
    return "OK" as const;
  });
  if (result === "OK") return NextResponse.json({ ok: true });
  return NextResponse.json({ error: result }, { status: result === "NOT_FOUND" ? 404 : 409 });
}
