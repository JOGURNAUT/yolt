import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AlertCircle } from "lucide-react";
import { getClaimForOrder, getSellerOrder } from "@yolt/core";
import { formatIndianMobile } from "@yolt/shared";
import { ClaimResponse } from "@/components/seller/claim-response";
import { CopyButton } from "@/components/seller/copy-button";
import { BackLink, PageHeader } from "@/components/seller/page-header";
import { CancelOrder, SellerOrderActions } from "@/components/seller/seller-order-actions";
import { SellerTimeline } from "@/components/seller/seller-timeline";
import { Countdown } from "@/components/ui/countdown";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { StatusBadge } from "@/components/ui/status-badge";
import { envFlags } from "@/lib/env";
import { formatINR, formatIST } from "@/lib/format";
import { ORDER_BADGE, timeLeft } from "@/lib/seller-format";
import { db } from "@/lib/server/db";
import { requireSeller } from "@/lib/server/session";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

const PAY_NOTES: Record<string, string> = {
  CONFIRMED: "Pays out 48 hours after delivery if no report is open.",
  PACKED: "Pays out 48 hours after delivery if no report is open.",
  SHIPPED: "In the protection window: pays out 48 hours after delivery if no report is open.",
  DELIVERED: "In the protection window: pays out 48 hours after delivery if no report is open.",
  CLOSED: "Past the buyer-protection window.",
  CANCELLED_BY_SELLER: "Cancelled and refunded to the buyer.",
  CANCELLED_BY_BUYER: "Cancelled and refunded to the buyer.",
};

export default async function SellerOrderPage({ params }: PageProps<"/seller/orders/[id]">) {
  await connection();
  const orderId = (await params).id;
  const current = await requireSeller(`/seller/orders/${orderId}`);
  const data = await getSellerOrder(db, { sellerId: current.seller.id, orderId });
  if (!data) notFound();
  const { order, items, shipment, events } = data;
  const a = order.shippingAddress;
  const claim = await getClaimForOrder(db, order.id);
  const now = new Date();
  const overdue = order.status === "CONFIRMED" && order.dispatchBy !== null && order.dispatchBy.getTime() < now.getTime();
  const badge = overdue ? { tone: "danger" as const, label: "Overdue" } : (ORDER_BADGE[order.status] ?? { tone: "neutral" as const, label: order.status });
  const addressText = a ? [a.name, [a.line1, a.line2].filter(Boolean).join(", "), a.landmark ? `Near ${a.landmark}` : null, `${a.city}, ${a.state} ${a.pincode}`, formatIndianMobile(a.phone)].filter(Boolean).join("\n") : "";
  const canCancel = order.status === "CONFIRMED" || (order.status === "PACKED" && shipment?.status === "BOOKED");

  return (
    <>
      <BackLink href="/seller/orders">All orders</BackLink>
      <PageHeader
        size="h1"
        title={
          <>
            Order <span className="t-mono !text-[0.8em]">{order.reference}</span>
          </>
        }
        actions={
          <StatusBadge tone={badge.tone}>
            {overdue && <AlertCircle aria-hidden className="ic ic-14" strokeWidth={ICON_STROKE} />}
            {badge.label}
          </StatusBadge>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {(order.status === "CONFIRMED" || order.status === "PACKED" || shipment) && (
            <section aria-labelledby="ship-h" className={cx("sec", order.status === "CONFIRMED" && "is-emphasis")}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="ship-h" className="t-h2">
                  {order.status === "CONFIRMED" ? "Pack and ship" : "Shipment"}
                </h2>
                {order.status === "CONFIRMED" && order.dispatchBy && (
                  <span className={cx("t-small font-bold", overdue && "text-danger")}>
                    Ship by {formatIST(order.dispatchBy)} · {timeLeft(order.dispatchBy, now)}
                  </span>
                )}
              </div>
              {order.status === "CONFIRMED" && order.dispatchBy && !overdue && <Countdown ms={order.dispatchBy.getTime() - now.getTime()} size="sm" label="Ship within" />}
              {order.status === "CONFIRMED" && (
                <>
                  <ol className="t-small m-0 flex list-decimal flex-col gap-1.5 pl-5">
                    <li>Check it matches the listing photos, flaws and all.</li>
                    <li>
                      Pack it so it can&apos;t get wet or crushed. Put the order number <span className="t-mono !text-xs">{order.reference}</span> on a slip inside.
                    </li>
                    <li>Tap Packed — book pickup, then print the label and stick it on the parcel.</li>
                  </ol>
                  <p className="help">If it isn&apos;t shipped within 48 hours after the deadline, the buyer can cancel for a full refund.</p>
                </>
              )}
              <SellerOrderActions
                orderId={order.id}
                status={order.status}
                shipment={shipment ? { awb: shipment.awb, courierName: shipment.courierName, labelUrl: shipment.labelUrl, status: shipment.status } : null}
                devShipping={envFlags().sandboxTools}
              />
            </section>
          )}

          {claim && (
            <ClaimResponse
              claim={{
                id: claim.id,
                status: claim.status,
                reason: claim.reason,
                description: claim.description,
                photoUrls: claim.photoUrls,
                sellerResponse: claim.sellerResponse,
                reportedAt: formatIST(claim.createdAt),
              }}
            />
          )}

          <section aria-labelledby="items-h" className="sec">
            <h2 id="items-h" className="t-h2">
              {items.length === 1 ? "Item" : "Items"}
            </h2>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {items.map((i) => (
                <li key={i.id} className="flex items-center gap-3.5">
                  {i.snapshot.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- snapshot of the item sold
                    <img src={i.snapshot.photoUrl} alt="" className="aspect-[4/5] w-14 rounded-[10px] object-cover" />
                  ) : (
                    <span aria-hidden="true" className="ph !w-14 !rounded-[10px]" />
                  )}
                  <span className="t-small flex min-w-0 grow flex-col gap-0.5">
                    <span className="font-bold">{i.snapshot.title}</span>
                    <span className="muted">{[i.snapshot.tagSize, i.snapshot.condition ? i.snapshot.condition.replace("_", " ").toLowerCase() : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="t-small font-bold">{formatINR(i.pricePaise)}</span>
                </li>
              ))}
            </ul>
          </section>

          {(shipment || order.confirmedAt) && (
            <section aria-labelledby="timeline-h" className="sec">
              <h2 id="timeline-h" className="t-h2">
                Timeline
              </h2>
              <SellerTimeline paidAt={order.confirmedAt} events={events} />
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section aria-labelledby="addr-h" className="card flex flex-col gap-2 p-5">
            <h2 id="addr-h" className="t-h3 !normal-case">
              Ship to
            </h2>
            {a ? (
              <>
                <address className="t-small not-italic">
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
                </address>
                <p className="t-small muted">{formatIndianMobile(a.phone)}</p>
                <CopyButton text={addressText} label="Copy address" className="self-start" />
              </>
            ) : (
              <p className="t-small font-semibold text-danger">No delivery address on this order.</p>
            )}
          </section>

          <section aria-labelledby="money-h" className="card flex flex-col gap-2 p-5">
            <h2 id="money-h" className="t-h3 !normal-case">
              Money
            </h2>
            <dl className="m-0 flex flex-col gap-1.5">
              <div className="t-small flex justify-between">
                <dt>{items.length === 1 ? "Item" : "Items"}</dt>
                <dd className="m-0">{formatINR(order.subtotalPaise)}</dd>
              </div>
              <div className="t-small flex justify-between">
                <dt>Shipping paid by buyer</dt>
                <dd className="m-0">{formatINR(order.shippingPaise)}</dd>
              </div>
              <div className="t-small flex justify-between">
                <dt>Commission</dt>
                <dd className="m-0">₹0 · Pilot: no commission</dd>
              </div>
              <div className="flex justify-between border-t border-dashed border-line pt-2">
                <dt className="t-h3 !text-[15px]">You get</dt>
                <dd className="t-h3 m-0 !text-[15px]">{formatINR(order.totalPaise)}</dd>
              </div>
            </dl>
            <p className="t-small muted">{PAY_NOTES[order.status] ?? ""}</p>
            <p className="t-caption muted !font-medium">{order.source === "SELLER_LINK" ? "Your link: the buyer came through your store link." : "Found on YOLT: the buyer found you on YOLT."}</p>
          </section>

          {canCancel && <CancelOrder orderId={order.id} />}
        </aside>
      </div>
    </>
  );
}
