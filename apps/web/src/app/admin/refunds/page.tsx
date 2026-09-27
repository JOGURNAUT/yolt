import { connection } from "next/server";
import { listRefundsForAdmin } from "@yolt/core";
import { MarkRefundDone } from "@/components/admin/admin-actions";
import { formatINR, formatIST } from "@/lib/format";
import { db } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/session";

const REASONS: Record<string, string> = {
  ITEM_UNAVAILABLE: "Paid after reservation expired",
  ORDER_NOT_PAYABLE: "Duplicate payment",
  CANCELLED_BY_SELLER: "Seller cancelled",
  CANCELLED_BY_BUYER: "Late dispatch cancel",
};

export default async function AdminRefunds() {
  await connection();
  const { stale, role } = await requireAdmin();
  if (stale) return null;
  const [open, done] = await Promise.all([listRefundsForAdmin(db, { open: true }), listRefundsForAdmin(db, { open: false })]);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-semibold">To issue ({open.length})</h2>
        <p className="text-xs text-muted">
          Until refunds run automatically, issue each one in the payment provider&apos;s dashboard, then record its refund id here.
        </p>
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
          {open.length === 0 && <li className="p-3 text-muted">Nothing to refund.</li>}
          {open.map(({ refund, reference }) => (
            <li key={refund.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <span>
                <span className="font-medium">{formatINR(refund.amountPaise)}</span> · {reference} ·{" "}
                {REASONS[refund.reason] ?? refund.reason.replace(/^CLAIM_/, "Claim: ").toLowerCase()} · {formatIST(refund.createdAt)}
              </span>
              {role === "ADMIN" && <MarkRefundDone refundId={refund.id} />}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Issued ({done.length})</h2>
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
          {done.map(({ refund, reference }) => (
            <li key={refund.id} className="flex justify-between p-3 text-muted">
              <span>{formatINR(refund.amountPaise)} · {reference}</span>
              <span className="font-mono text-xs">{refund.providerRefundId}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
