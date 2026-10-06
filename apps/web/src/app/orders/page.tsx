import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { connection } from "next/server";
import { getBuyerOrders } from "@yolt/core";
import { GarmentImage } from "@/components/garment-image";
import { IN_PROGRESS, orderBadge } from "@/components/orders/order-status";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatINR } from "@/lib/format";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Your orders", robots: { index: false } };

const day = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(d);

export default async function OrdersPage() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/orders");
  const orders = await getBuyerOrders(db, user.userId);
  const groups = [
    { title: "In progress", rows: orders.filter((o) => IN_PROGRESS.includes(o.status)) },
    { title: "Past orders", rows: orders.filter((o) => !IN_PROGRESS.includes(o.status)) },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="t-display">Your orders</h1>
      {orders.length === 0 ? (
        <EmptyState
          tag="No orders"
          title="Nothing here yet."
          className="mx-auto w-full max-w-md"
          action={<ButtonLink href="/search">Start exploring</ButtonLink>}
        >
          When you buy a piece, you&apos;ll track it here, from packing to your door.
        </EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.title} aria-label={g.title} className="flex flex-col gap-2.5">
            <h2 className="t-h2">{g.title}</h2>
            <ul className="flex flex-col gap-2.5">
              {g.rows.map((o) => {
                const b = orderBadge(o.status, o.overdue);
                return (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="card flex items-start gap-3 p-3.5 no-underline">
                      <span className="w-[60px] shrink-0">
                        <GarmentImage src={o.firstItem.photoUrl} alt="" category={o.firstItem.category} className="!rounded-md" />
                      </span>
                      <span className="flex min-w-0 grow flex-col gap-1.5">
                        <span>
                          <StatusBadge tone={b.tone}>{b.label}</StatusBadge>
                        </span>
                        <span className="t-h3 !text-[15px] !leading-5">
                          {o.firstItem.title}
                          {o.itemCount > 1 && <span className="muted"> + {o.itemCount - 1} more</span>}
                        </span>
                        <span className="t-small muted">
                          <span className="t-mono !text-xs">{o.reference}</span> · {o.sellerName} · {formatINR(o.totalPaise)}
                          {o.confirmedAt ? ` · ${day(o.confirmedAt)}` : ""}
                        </span>
                      </span>
                      <ChevronRight aria-hidden className="ic mt-6 shrink-0" strokeWidth={1.75} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
