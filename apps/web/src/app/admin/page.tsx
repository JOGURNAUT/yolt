import Link from "next/link";
import { connection } from "next/server";
import { getAdminCounts, listExceptions } from "@yolt/core";
import { formatINR, formatIST } from "@/lib/format";
import { db } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/session";

export default async function AdminHome() {
  await connection();
  // Pages render concurrently with the layout, so each admin page checks access itself.
  const { stale } = await requireAdmin();
  if (stale) return null;
  const [counts, exceptions] = await Promise.all([getAdminCounts(db), listExceptions(db)]);
  const tiles = [
    { label: "Disputed claims to decide", n: counts.escalated_claims, href: "/admin/claims" },
    { label: "Claims waiting on sellers", n: counts.open_claims, href: "/admin/claims?status=OPEN" },
    { label: "Stores awaiting KYC", n: counts.pending_kyc, href: "/admin/sellers" },
    { label: "Refunds to issue", n: counts.refunds_requested, href: "/admin/refunds" },
  ];

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className={`rounded-lg border p-4 hover:border-foreground ${t.n > 0 ? "border-foreground" : "border-line"}`}>
            <p className="text-3xl font-bold">{t.n}</p>
            <p className="text-sm text-muted">{t.label}</p>
          </Link>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Paid too late: item went to someone else ({exceptions.needsRefund.length})</h2>
        <p className="text-xs text-muted">These buyers paid after their reservation expired. A refund was queued automatically; issue it from Refunds.</p>
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
          {exceptions.needsRefund.length === 0 && <li className="p-3 text-muted">None.</li>}
          {exceptions.needsRefund.map((o) => (
            <li key={o.id} className="flex justify-between p-3">
              <span>{o.reference}</span>
              <span className="text-muted">{formatINR(o.totalPaise)} · {formatIST(o.updatedAt)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Returning to seller: delivery failed ({exceptions.rto.length})</h2>
        <p className="text-xs text-muted">Contact the buyer and decide: re-attempt delivery or refund.</p>
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
          {exceptions.rto.length === 0 && <li className="p-3 text-muted">None.</li>}
          {exceptions.rto.map((s) => (
            <li key={s.awb} className="flex justify-between p-3">
              <span>{s.reference} · {s.courierName} <span className="font-mono">{s.awb}</span></span>
              <span className="text-muted">{formatIST(s.updatedAt)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
