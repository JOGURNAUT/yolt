import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getSellerOrderCounts, getSellerOrders, SELLER_ORDER_TABS, type SellerOrderTab } from "@yolt/core";
import { formatINR, formatIST } from "@/lib/format";
import { db } from "@/lib/server/db";
import { requireSeller } from "@/lib/server/session";

export const metadata: Metadata = { title: "Orders", robots: { index: false } };

const TAB_LABELS: Record<SellerOrderTab, string> = {
  "to-ship": "To ship",
  packed: "Awaiting pickup",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default async function SellerOrdersPage({ searchParams }: PageProps<"/seller/orders">) {
  await connection();
  const current = await requireSeller("/seller/orders");
  const requested = (await searchParams).tab;
  const tab: SellerOrderTab = typeof requested === "string" && requested in SELLER_ORDER_TABS ? (requested as SellerOrderTab) : "to-ship";
  const [items, counts] = await Promise.all([
    getSellerOrders(db, { sellerId: current.seller.id, tab }),
    getSellerOrderCounts(db, current.seller.id),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Orders</h1>
      <nav aria-label="Order status" className="flex gap-2 overflow-x-auto pb-1">
        {(Object.keys(TAB_LABELS) as SellerOrderTab[]).map((t) => (
          <Link
            key={t}
            href={t === "to-ship" ? "/seller/orders" : `/seller/orders?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${t === tab ? "border-foreground bg-foreground text-background" : "border-line"}`}
          >
            {TAB_LABELS[t]} <span className={t === tab ? "opacity-80" : "text-muted"}>{counts[t]}</span>
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{tab === "to-ship" ? "Nothing to ship right now." : `No ${TAB_LABELS[tab].toLowerCase()} orders.`}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {items.map((o) => {
            const overdue = tab === "to-ship" && o.overdue;
            return (
              <li key={o.id}>
                <Link href={`/seller/orders/${o.id}`} className="flex items-center gap-3 p-3 hover:bg-background">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 font-medium">
                      {o.firstItem.title}
                      {o.itemCount > 1 && <span className="text-muted"> + {o.itemCount - 1} more</span>}
                    </p>
                    <p className="text-sm text-muted">
                      {o.reference} · {o.shippingAddress?.city ?? "No address"} · {formatINR(o.totalPaise)}
                      {o.source === "SELLER_LINK" && " · Your link"}
                    </p>
                  </div>
                  {tab === "to-ship" && o.dispatchBy && (
                    <span className={`shrink-0 text-xs ${overdue ? "font-semibold text-danger" : "text-muted"}`}>
                      {overdue ? "Overdue · " : "Ship by "}
                      {formatIST(o.dispatchBy)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
