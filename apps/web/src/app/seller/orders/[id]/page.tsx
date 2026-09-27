import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getClaimForOrder, getSellerOrder } from "@yolt/core";
import { formatIndianMobile } from "@yolt/shared";
import { OrderTimeline, ORDER_STATUS_LABELS } from "@/components/order-timeline";
import { ClaimResponse } from "@/components/seller/claim-response";
import { SellerOrderActions } from "@/components/seller/seller-order-actions";
import { envFlags } from "@/lib/env";
import { formatINR, formatIST } from "@/lib/format";
import { db } from "@/lib/server/db";
import { requireSeller } from "@/lib/server/session";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

export default async function SellerOrderPage({ params }: PageProps<"/seller/orders/[id]">) {
  await connection();
  const orderId = (await params).id;
  const current = await requireSeller(`/seller/orders/${orderId}`);
  const data = await getSellerOrder(db, { sellerId: current.seller.id, orderId });
  if (!data) notFound();
  const { order, items, shipment, events } = data;
  const a = order.shippingAddress;
  const claim = await getClaimForOrder(db, order.id);

  return (
    <div className="space-y-6">
      <Link href="/seller/orders" className="text-sm text-muted hover:underline">
        ← All orders
      </Link>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">Order {order.reference}</h1>
        <p className="text-sm">{ORDER_STATUS_LABELS[order.status] ?? order.status}</p>
      </header>

      {order.status === "CONFIRMED" && order.dispatchBy && (
        <p className="rounded-md border border-line bg-surface p-3 text-sm">
          Pack and book a pickup by <span className="font-semibold">{formatIST(order.dispatchBy)}</span>. If it isn&apos;t shipped within 48
          hours after that, the buyer can cancel for a full refund.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-3">
          <h2 className="font-semibold">Items</h2>
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
          <p className="text-xs text-muted">{order.source === "SELLER_LINK" ? "Buyer came through your link: no commission." : "Buyer found you on YOLT."}</p>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Ship to</h2>
          {a ? (
            <address className="rounded-lg border border-line bg-surface p-3 text-sm not-italic">
              {a.name}
              <br />
              {a.line1}
              {a.line2 && <>, {a.line2}</>}
              {a.landmark && (
                <>
                  <br />
                  Near {a.landmark}
                </>
              )}
              <br />
              {a.city}, {a.state} {a.pincode}
              <br />
              {formatIndianMobile(a.phone)}
            </address>
          ) : (
            <p className="text-sm text-danger">No delivery address on this order.</p>
          )}
        </section>
      </div>

      {claim && (
        <ClaimResponse
          claim={{ id: claim.id, status: claim.status, reason: claim.reason, description: claim.description, photoUrls: claim.photoUrls, sellerResponse: claim.sellerResponse }}
        />
      )}

      <SellerOrderActions
        orderId={order.id}
        status={order.status}
        shipment={shipment ? { awb: shipment.awb, courierName: shipment.courierName, labelUrl: shipment.labelUrl, status: shipment.status } : null}
        devShipping={envFlags().sandboxTools}
      />

      {(shipment || order.confirmedAt) && (
        <section className="space-y-3">
          <h2 className="font-semibold">Timeline</h2>
          <OrderTimeline paidAt={order.confirmedAt} events={events} />
        </section>
      )}
    </div>
  );
}
