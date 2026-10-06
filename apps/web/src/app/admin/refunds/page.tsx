import type { Metadata } from "next";
import { connection } from "next/server";
import { listRefundsForAdmin } from "@yolt/core";
import { ReadOnlyNote } from "@/components/admin/admin-ui";
import { RefundActions } from "@/components/admin/refund-actions";
import { PageHeader } from "@/components/seller/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { formatINR, formatIST } from "@/lib/format";
import { db } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Refunds" };

const REASONS: Record<string, string> = {
  ITEM_UNAVAILABLE: "Paid after reservation expired",
  ORDER_NOT_PAYABLE: "Duplicate payment",
  CANCELLED_BY_SELLER: "Seller cancelled",
  CANCELLED_BY_BUYER: "Late dispatch cancel",
};
const STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  FAILED: { tone: "danger", label: "Failed" },
  PROCESSING: { tone: "soon", label: "Processing" },
  REQUESTED: { tone: "reserved", label: "To issue" },
};

export default async function AdminRefunds() {
  await connection();
  const { stale, role } = await requireAdmin();
  if (stale) return null;
  const [open, done] = await Promise.all([listRefundsForAdmin(db, { open: true }), listRefundsForAdmin(db, { open: false })]);
  // Failed first: they are the ones nobody is waiting on automatically.
  const queue = [...open].sort((a, b) => Number(b.refund.status === "FAILED") - Number(a.refund.status === "FAILED"));

  return (
    <>
      <PageHeader title="Refunds" kicker="Failed, processing and waiting to be issued" size="h1" />

      <section className="sec" aria-labelledby="to-issue">
        <div>
          <h2 id="to-issue" className="t-h2">
            To issue ({queue.length})
          </h2>
          <p className="t-small muted mt-1">
            Until refunds run automatically, issue each one in the payment provider&apos;s dashboard, then record its refund id here. Retry queues a failed one again.
          </p>
        </div>
        {queue.length === 0 ? (
          <EmptyState tag="₹0" title="Nothing to refund">
            Refunds from decided reports and late payments wait here until they are issued.
          </EmptyState>
        ) : (
          <ul className="m-0 list-none divide-y divide-line p-0">
            {queue.map(({ refund, reference }) => {
              const s = STATUS[refund.status] ?? { tone: "neutral" as const, label: refund.status };
              return (
                <li key={refund.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-3">
                  <div className="min-w-0">
                    <p className="t-body flex flex-wrap items-center gap-2">
                      <span className="font-bold">{formatINR(refund.amountPaise)}</span>
                      <span className="font-mono">{reference}</span>
                      <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                    </p>
                    <p className="t-small muted">
                      {REASONS[refund.reason] ?? refund.reason.replace(/^CLAIM_/, "Report: ").replace(/_/g, " ").toLowerCase()} · {formatIST(refund.createdAt)}
                    </p>
                  </div>
                  {role === "ADMIN" ? <RefundActions refundId={refund.id} reference={reference} failed={refund.status === "FAILED"} /> : <ReadOnlyNote />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="sec" aria-labelledby="issued">
        <h2 id="issued" className="t-h2">
          Issued ({done.length})
        </h2>
        {done.length === 0 ? (
          <p className="t-small muted">None yet.</p>
        ) : (
          <ul className="m-0 list-none divide-y divide-line p-0 text-sm">
            {done.map(({ refund, reference }) => (
              <li key={refund.id} className="flex flex-wrap justify-between gap-x-4 py-2.5">
                <span>
                  {formatINR(refund.amountPaise)} · <span className="font-mono">{reference}</span>
                </span>
                <span className="muted font-mono text-xs">{refund.providerRefundId}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
