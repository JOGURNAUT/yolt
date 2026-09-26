import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getBuyerOrders } from "@yolt/core";
import { ORDER_STATUS_LABELS } from "@/components/order-timeline";
import { formatINR } from "@/lib/format";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Your orders", robots: { index: false } };

export default async function OrdersPage() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/orders");
  const orders = await getBuyerOrders(db, user.userId);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Your orders</h1>
      {orders.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          No orders yet.{" "}
          <Link href="/" className="underline">
            Find something you love
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-background">
                <div className="min-w-0">
                  <p className="line-clamp-1 font-medium">
                    {o.firstItem.title}
                    {o.itemCount > 1 && <span className="text-muted"> + {o.itemCount - 1} more</span>}
                  </p>
                  <p className="text-sm text-muted">
                    {o.sellerName} · {o.reference} · {formatINR(o.totalPaise)}
                  </p>
                </div>
                <span className="shrink-0 text-right text-xs">{ORDER_STATUS_LABELS[o.status] ?? o.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
