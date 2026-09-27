import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { claimWindow, getBuyerOrder, getClaimForOrder, getReviewableItems, lateCancelAvailableAt } from "@yolt/core";
import { LateCancelButton } from "@/components/late-cancel-button";
import { OrderTimeline, ORDER_STATUS_LABELS } from "@/components/order-timeline";
import { ClaimSection, ReviewForm } from "@/components/order-trust";
import { formatINR, formatIST } from "@/lib/format";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  await connection();
  const orderId = (await params).id;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/orders/${orderId}`);
  const data = await getBuyerOrder(db, { buyerId: user.userId, orderId });
  if (!data || !data.order.confirmedAt) notFound();
  const { order, items, shipment, events } = data;
  const cancelAt = lateCancelAvailableAt(order);
  const [claim, reviewable] = await Promise.all([getClaimForOrder(db, order.id), getReviewableItems(db, { buyerId: user.userId, orderId: order.id })]);
  const claimWin = claimWindow(order, null);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/orders" className="text-sm text-muted hover:underline">
        ← Your orders
      </Link>
      <header>
        <h1 className="text-xl font-bold">Order {order.reference}</h1>
        <p className="text-sm">
          {ORDER_STATUS_LABELS[order.status] ?? order.status} · from{" "}
          <Link href={`/s/${data.sellerHandle}`} className="underline">
            {data.sellerName}
          </Link>
        </p>
      </header>

      {order.status === "CONFIRMED" && order.dispatchBy && (
        <p className="rounded-md border border-line bg-surface p-3 text-sm">The seller ships by {formatIST(order.dispatchBy)}.</p>
      )}

      <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
        {items.map((i) => (
          <li key={i.id} className="flex justify-between gap-3 p-3">
            <span>
              {i.snapshot.title}
              {i.snapshot.tagSize && <span className="text-muted"> · {i.snapshot.tagSize}</span>}
            </span>
            <span>{formatINR(i.pricePaise)}</span>
          </li>
        ))}
        <li className="flex justify-between p-3 font-medium">
          <span>Total paid</span>
          <span>{formatINR(order.totalPaise)}</span>
        </li>
      </ul>

      {shipment && (
        <p className="text-sm">
          {shipment.courierName} · AWB <span className="font-mono">{shipment.awb}</span>
          {shipment.trackingUrl && (
            <>
              {" · "}
              <a href={shipment.trackingUrl} target="_blank" rel="noopener" className="underline">
                Track with courier
              </a>
            </>
          )}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">Timeline</h2>
        <OrderTimeline paidAt={order.confirmedAt} events={events} />
      </section>

      {cancelAt && <LateCancelButton orderId={order.id} availableAt={cancelAt.toISOString()} />}

      <ClaimSection
        orderId={order.id}
        claim={claim && { id: claim.id, status: claim.status, reason: claim.reason, description: claim.description, sellerResponse: claim.sellerResponse }}
        windowOpen={claimWin.open}
        windowClosesAt={claimWin.open && claimWin.closesAt ? claimWin.closesAt.toISOString() : null}
        deliveredMode={order.status === "DELIVERED"}
      />

      {reviewable.map((item) => (
        <ReviewForm key={item.id} orderItemId={item.id} title={item.snapshot.title} />
      ))}
    </div>
  );
}
