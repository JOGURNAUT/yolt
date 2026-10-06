import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, ClockAlert, PackageCheck, ShieldAlert, Store, Undo2, type LucideIcon } from "lucide-react";
import { listExceptions } from "@yolt/core";
import { PageHeader } from "@/components/seller/page-header";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { formatINR, formatIST } from "@/lib/format";
import { getAdminDashboardCounts } from "@/lib/server/admin-queries";
import { db } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Overview" };

type Tile = { key: string; label: string; n: number; sub: string; icon: LucideIcon; href?: string; alert?: boolean };

export default async function AdminHome() {
  await connection();
  // Pages render concurrently with the layout, so each admin page checks access itself.
  const { stale } = await requireAdmin();
  if (stale) return null;
  const [counts, exceptions] = await Promise.all([getAdminDashboardCounts(), listExceptions(db)]);

  const tiles: Tile[] = [
    { key: "dispatch", label: "Paid orders awaiting dispatch", n: counts.to_dispatch, sub: "Sellers pack and ship these. Nothing to do unless they run late.", icon: PackageCheck },
    { key: "late", label: "Late dispatches", n: counts.late_dispatch, sub: "Past the seller's dispatch date. Buyers can cancel these.", icon: ClockAlert, alert: counts.late_dispatch > 0 },
    { key: "reports", label: "Escalated reports", n: counts.escalated_reports, sub: "Seller disputed it. YOLT decides.", icon: ShieldAlert, href: "/admin/claims", alert: counts.escalated_reports > 0 },
    { key: "refunds", label: "Failed refunds", n: counts.failed_refunds, sub: "The provider didn't complete these. Retry or record them.", icon: Undo2, href: "/admin/refunds", alert: counts.failed_refunds > 0 },
    { key: "apps", label: "New applications", n: counts.new_applications, sub: "Stores that applied to sell and haven't been contacted.", icon: Store, href: "/admin/sellers", alert: counts.new_applications > 0 },
  ];

  return (
    <>
      <PageHeader title="Overview" kicker="What needs a person today" size="h1" />

      <section aria-label="Counts" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((t) => {
          const body = (
            <>
              <span className="flex items-center justify-between gap-2">
                <span className="t-caption muted uppercase">{t.label}</span>
                <t.icon aria-hidden className="ic" strokeWidth={ICON_STROKE} />
              </span>
              <span className="t-display" data-count={t.key}>
                {t.n}
              </span>
              <span className="t-small muted grow">{t.sub}</span>
              {t.href && (
                <span className="t-small flex items-center gap-1 font-bold">
                  Open <ArrowRight aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />
                </span>
              )}
            </>
          );
          const cls = cx("card flex flex-col gap-2 p-4 !no-underline lg:p-[18px]", t.alert && "!shadow-[inset_0_0_0_2px_var(--foreground)]");
          return t.href ? (
            <Link key={t.key} href={t.href} className={cls} style={{ color: "inherit" }}>
              {body}
            </Link>
          ) : (
            <div key={t.key} className={cls}>
              {body}
            </div>
          );
        })}
      </section>

      <section className="sec" aria-labelledby="late-paid">
        <div>
          <h2 id="late-paid" className="t-h2">
            Paid too late ({exceptions.needsRefund.length})
          </h2>
          <p className="t-small muted mt-1">These buyers paid after their reservation ran out and the piece went to someone else. A refund was queued; issue it from Refunds.</p>
        </div>
        <ul className="m-0 list-none divide-y divide-line p-0 text-sm">
          {exceptions.needsRefund.length === 0 && <li className="py-2 muted">None.</li>}
          {exceptions.needsRefund.map((o) => (
            <li key={o.id} className="flex flex-wrap justify-between gap-x-4 py-2.5">
              <span className="font-mono">{o.reference}</span>
              <span className="muted">
                {formatINR(o.totalPaise)} · {formatIST(o.updatedAt)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="sec" aria-labelledby="rto">
        <div>
          <h2 id="rto" className="t-h2">
            Returning to seller ({exceptions.rto.length})
          </h2>
          <p className="t-small muted mt-1">Delivery failed. Contact the buyer, then re-attempt delivery or refund.</p>
        </div>
        <ul className="m-0 list-none divide-y divide-line p-0 text-sm">
          {exceptions.rto.length === 0 && <li className="py-2 muted">None.</li>}
          {exceptions.rto.map((s) => (
            <li key={s.awb} className="flex flex-wrap justify-between gap-x-4 py-2.5">
              <span>
                <span className="font-mono">{s.reference}</span> · {s.courierName} <span className="font-mono">{s.awb}</span>
              </span>
              <span className="muted">{formatIST(s.updatedAt)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
