import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getPayoutStatement, PAYOUT_PAGE_SIZE } from "@yolt/core";
import { PageHeader } from "@/components/seller/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatINR } from "@/lib/format";
import { formatDay } from "@/lib/store-format";
import { db } from "@/lib/server/db";
import { requireSeller } from "@/lib/server/session";

export const metadata: Metadata = { title: "Payouts", robots: { index: false } };

export default async function SellerPayoutsPage({ searchParams }: PageProps<"/seller/payouts">) {
  await connection();
  const current = await requireSeller("/seller/payouts");
  const p = Number((await searchParams).page);
  const page = Number.isInteger(p) && p > 1 ? p : 1;
  const s = await getPayoutStatement(db, { sellerId: current.seller.id, page });
  const pages = Math.max(1, Math.ceil(s.total / PAYOUT_PAGE_SIZE));
  const verified = current.seller.kycStatus === "VERIFIED";

  const balances = [
    { k: "Pending", v: s.balances.pendingPaise, note: "Still in the buyer-protection window, or a report is open." },
    { k: "Available", v: s.balances.availablePaise, note: "Past the window. Ready to pay out.", dark: true },
    { k: "Paid out", v: s.balances.paidOutPaise, note: "Sent to your bank." },
  ];

  return (
    <>
      <PageHeader title="Payouts" kicker={verified ? "PAN and bank verified" : "PAN and bank not verified yet"} />

      <section aria-label="Balances" className="grid gap-3 sm:grid-cols-3">
        {balances.map((b) => (
          <div key={b.k} className={b.dark ? "band-dark flex flex-col gap-2 rounded-2xl p-5" : "card flex flex-col gap-2 p-5"}>
            <span className={b.dark ? "t-caption uppercase text-[#c9c7c1]" : "t-caption muted uppercase"}>{b.k}</span>
            <span className={b.dark ? "t-display text-white" : "t-display"}>{formatINR(b.v)}</span>
            <span className={b.dark ? "t-small text-[#e4e2dc]" : "t-small muted"}>{b.note}</span>
          </div>
        ))}
      </section>

      <p className="t-small rounded-none bg-surface-2 p-3.5">
        You get the item price plus the shipping the buyer paid. Commission ₹0 · Pilot: no commission. An order is released 48 hours after delivery if no report is open.
      </p>

      <section aria-labelledby="stmt-h" className="space-y-2">
        <h2 id="stmt-h" className="t-h2">
          Statement
        </h2>
        {s.rows.length === 0 ? (
          <p className="t-small muted py-8 text-center">No paid orders yet.</p>
        ) : (
          <>
            <div className="card hidden overflow-x-auto p-3 lg:block">
              <table className="lt">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Paid</th>
                    <th>Items + shipping</th>
                    <th>Source</th>
                    <th>Commission</th>
                    <th>Refunded</th>
                    <th>You get</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r) => (
                    <tr key={r.orderId}>
                      <td className="t-mono !text-xs">
                        <Link href={`/seller/orders/${r.orderId}`}>{r.reference}</Link>
                      </td>
                      <td className="t-small">{formatDay(r.date)}</td>
                      <td className="t-small">{formatINR(r.itemsPaise + r.shippingPaise)}</td>
                      <td className="t-small">{r.sourceLabel}</td>
                      <td className="t-small">₹0 · Pilot</td>
                      <td className="t-small">{r.refundedPaise ? formatINR(r.refundedPaise) : "—"}</td>
                      <td className="t-small font-bold">{formatINR(r.netPaise)}</td>
                      <td>
                        <StatusBadge tone={r.bucket === "AVAILABLE" ? "available" : "reserved"}>{r.bucket === "AVAILABLE" ? "Available" : "Pending"}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="card m-0 list-none divide-y divide-line p-0 lg:hidden">
              {s.rows.map((r) => (
                <li key={r.orderId} className="flex flex-col gap-1.5 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/seller/orders/${r.orderId}`} className="t-mono !text-xs">
                      {r.reference}
                    </Link>
                    <StatusBadge tone={r.bucket === "AVAILABLE" ? "available" : "reserved"}>{r.bucket === "AVAILABLE" ? "Available" : "Pending"}</StatusBadge>
                  </div>
                  <div className="t-small flex justify-between">
                    <span className="muted">
                      {formatDay(r.date)} · {r.sourceLabel}
                    </span>
                    <strong>{formatINR(r.netPaise)}</strong>
                  </div>
                  <span className="t-caption muted !font-medium">
                    Items + shipping {formatINR(r.itemsPaise + r.shippingPaise)} · Commission ₹0 · Pilot: no commission
                    {r.refundedPaise ? ` · Refunded ${formatINR(r.refundedPaise)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {pages > 1 && (
          <nav aria-label="Statement pages" className="flex items-center justify-between">
            {page > 1 ? <Link href={`/seller/payouts?page=${page - 1}`} className="btn btn-sm btn-secondary !h-11">Newer</Link> : <span />}
            <span className="t-small muted">
              Page {page} of {pages}
            </span>
            {page < pages ? <Link href={`/seller/payouts?page=${page + 1}`} className="btn btn-sm btn-secondary !h-11">Older</Link> : <span />}
          </nav>
        )}
      </section>
    </>
  );
}
