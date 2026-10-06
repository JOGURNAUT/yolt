import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AlertCircle, ChevronRight } from "lucide-react";
import { getOpenClaimsForSeller, getSellerOrderCounts, getSellerOrders, SELLER_ORDER_TABS, type SellerOrderTab } from "@yolt/core";
import { PageHeader } from "@/components/seller/page-header";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatINR, formatIST } from "@/lib/format";
import { CLAIM_REASON_LABELS, ORDER_BADGE, timeLeft } from "@/lib/seller-format";
import { db } from "@/lib/server/db";
import { requireSeller } from "@/lib/server/session";

export const metadata: Metadata = { title: "Orders", robots: { index: false } };

type Tab = SellerOrderTab | "issues";

const TAB_LABELS: Record<Tab, string> = {
  "to-ship": "To pack",
  packed: "Awaiting pickup",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  issues: "Issues",
};

const NOTES: Record<Tab, string> = {
  "to-ship": "Ship within your promised time. If it's more than 48 hours late, the buyer can cancel for a full refund.",
  packed: "A pickup is booked. Hand the parcel to the courier and keep the label on it.",
  shipped: "Tracking updates as the courier scans the parcel.",
  delivered: "Money for an order is released 48 hours after delivery if no report is open.",
  cancelled: "Cancelled orders are refunded to the buyer in full.",
  issues: "Accept and refund, or explain your side. If you and the buyer disagree, YOLT decides.",
};

const EMPTY: Record<Tab, string> = {
  "to-ship": "Nothing to ship right now. New paid orders show up here.",
  packed: "No orders are waiting for pickup.",
  shipped: "No orders are on the way.",
  delivered: "No delivered orders yet.",
  cancelled: "No cancelled orders.",
  issues: "No open reports. A buyer's report about an order shows up here.",
};

export default async function SellerOrdersPage({ searchParams }: PageProps<"/seller/orders">) {
  await connection();
  const current = await requireSeller("/seller/orders");
  const requested = (await searchParams).tab;
  const tab: Tab = requested === "issues" ? "issues" : typeof requested === "string" && requested in SELLER_ORDER_TABS ? (requested as SellerOrderTab) : "to-ship";
  const sellerId = current.seller.id;
  const now = new Date();
  const [counts, claims] = await Promise.all([getSellerOrderCounts(db, sellerId), getOpenClaimsForSeller(db, sellerId)]);
  const items = tab === "issues" ? [] : await getSellerOrders(db, { sellerId, tab });
  const tabCount = (t: Tab) => (t === "issues" ? claims.length : counts[t]);
  const empty = tab === "issues" ? claims.length === 0 : items.length === 0;

  return (
    <>
      <PageHeader title="Orders" kicker="Times in IST" />

      <nav aria-label="Order status" className="hscroll-bleed flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0 [scrollbar-width:none]">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={t === "to-ship" ? "/seller/orders" : `/seller/orders?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={cx("pill !no-underline", t === tab && "is-active")}
          >
            {TAB_LABELS[t]} <span className="n">{tabCount(t)}</span>
          </Link>
        ))}
      </nav>

      <p className="t-small flex items-start gap-2.5 rounded-none bg-surface-2 p-3.5">{NOTES[tab]}</p>

      {empty ? (
        <p className="t-small muted py-10 text-center">{EMPTY[tab]}</p>
      ) : tab === "issues" ? (
        <ul className="card divide-y divide-line overflow-hidden">
          {claims.map(({ claim, reference }) => (
            <li key={claim.id}>
              <Link href={`/seller/orders/${claim.orderId}`} className="flex min-h-[72px] items-center gap-3 p-3.5 !no-underline" style={{ color: "inherit" }}>
                <span className="flex min-w-0 grow flex-col gap-1">
                  <span className="t-small font-bold">{CLAIM_REASON_LABELS[claim.reason] ?? claim.reason}</span>
                  <span className="t-small muted line-clamp-1">{claim.description}</span>
                  <span className="t-mono muted !text-xs">
                    {reference} · reported {formatIST(claim.createdAt)}
                  </span>
                </span>
                <StatusBadge tone="danger">
                  <AlertCircle aria-hidden className="ic ic-14" strokeWidth={ICON_STROKE} />
                  Report open
                </StatusBadge>
                <span className="btn btn-sm btn-primary hidden sm:inline-flex">Respond</span>
                <ChevronRight aria-hidden className="ic ic-16 shrink-0" strokeWidth={ICON_STROKE} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {items.map((o) => {
            const overdue = tab === "to-ship" && o.overdue;
            const badge = overdue ? { tone: "danger" as const, label: "Overdue" } : (ORDER_BADGE[o.status] ?? { tone: "neutral" as const, label: o.status });
            return (
              <li key={o.id}>
                <Link href={`/seller/orders/${o.id}`} className="flex min-h-[84px] items-center gap-3 p-3.5 !no-underline hover:bg-surface-2" style={{ color: "inherit" }}>
                  <div className="w-11 shrink-0 lg:w-9">
                    {o.firstItem.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- snapshot of the item sold
                      <img src={o.firstItem.photoUrl} alt="" className="aspect-[4/5] w-full rounded-lg object-cover" />
                    ) : (
                      <span aria-hidden="true" className="ph !rounded-lg" />
                    )}
                  </div>
                  <span className="flex min-w-0 grow flex-col gap-1">
                    <span className="t-small line-clamp-1 font-bold">
                      {o.firstItem.title}
                      {o.itemCount > 1 && <span className="muted font-medium"> + {o.itemCount - 1} more</span>}
                    </span>
                    <span className="t-small muted">
                      Ship to {o.shippingAddress?.city ?? "—"}
                      {o.shippingAddress?.pincode ? ` ${o.shippingAddress.pincode}` : ""} · {formatINR(o.totalPaise)}
                    </span>
                    <span className="t-mono muted !text-xs">
                      {o.reference}
                      {o.source === "SELLER_LINK" && " · Your link"}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 text-right">
                    <StatusBadge tone={badge.tone}>
                      {overdue && <AlertCircle aria-hidden className="ic ic-14" strokeWidth={ICON_STROKE} />}
                      {badge.label}
                    </StatusBadge>
                    {tab === "to-ship" && o.dispatchBy && (
                      <span className={cx("t-caption", overdue && "text-danger")}>
                        Ship by {formatIST(o.dispatchBy)} · {timeLeft(o.dispatchBy, now)}
                      </span>
                    )}
                  </span>
                  <ChevronRight aria-hidden className="ic ic-16 shrink-0" strokeWidth={ICON_STROKE} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
