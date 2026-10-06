import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { connection } from "next/server";
import { claimWindow, getBuyerOrder, getClaimForOrder, getReviewableItems, lateCancelAvailableAt } from "@yolt/core";
import { PriceSummary } from "@/components/checkout/price-summary";
import { SnapshotLine } from "@/components/checkout/snapshot-line";
import { LateCancelButton } from "@/components/late-cancel-button";
import { BuyerTimeline, timelineSteps } from "@/components/orders/buyer-timeline";
import { orderBadge } from "@/components/orders/order-status";
import { ClaimSection, ReviewForm } from "@/components/order-trust";
import { ProtectionNote } from "@/components/product/detail-blocks";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatINR, formatIST } from "@/lib/format";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/session";

const nowMs = () => Date.now();

export const metadata: Metadata = { title: "Order", robots: { index: false } };

const day = (d: Date) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(d);

function headline(status: string, order: { dispatchBy: Date | null; totalPaise: number }, sellerName: string, late: boolean, hasClaim: boolean) {
  if (late) return { title: `${sellerName} hasn't shipped yet.`, body: "You can wait, or cancel now and get every rupee back." };
  if (hasClaim) return { title: `We've told ${sellerName}.`, body: "Keep the piece and its packaging as they are until this is settled." };
  switch (status) {
    case "CONFIRMED":
    case "PACKED":
      return {
        title: status === "PACKED" ? `${sellerName} has packed it.` : `${sellerName} is packing it.`,
        body: order.dispatchBy ? `Ships by ${day(order.dispatchBy)}. If ${sellerName} misses that by 48 h, you can cancel for a full refund in one tap.` : "",
      };
    case "SHIPPED":
      return { title: "It's on the way.", body: "Track it with the courier below." };
    case "DELIVERED":
      return { title: "Delivered. Take a look.", body: "Check it against the listing photos and measurements now, before you wear or wash it." };
    case "CLOSED":
      return { title: "Enjoy its second life.", body: "This order is complete." };
    case "CANCELLED_BY_BUYER":
    case "CANCELLED_BY_SELLER":
      return { title: `Cancelled. Refund of ${formatINR(order.totalPaise)} started.`, body: "Usually back in your account in 5–7 working days." };
    default:
      return { title: "Refund in progress.", body: "Usually back in your account in 5–7 working days." };
  }
}

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
  const late = cancelAt !== null && cancelAt.getTime() <= nowMs();
  const badge = orderBadge(order.status, late);
  const h = headline(order.status, order, data.sellerName, late, claim !== null && order.status === "DELIVERED");
  const steps = timelineSteps({ ...order, late, courierName: shipment?.courierName });
  const a = order.shippingAddress;

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      <Link href="/orders" className="t-small inline-flex min-h-11 items-center gap-1 self-start font-bold no-underline">
        <ChevronLeft aria-hidden className="ic ic-16" strokeWidth={1.75} />
        Your orders
      </Link>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <header className="flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
              <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
              <span className="t-mono muted !text-[13px]">{order.reference}</span>
            </div>
            <h1 className="t-h1 lg:t-display">{h.title}</h1>
            <p className="t-body muted">{h.body}</p>
            <p className="t-small">
              From{" "}
              <Link href={`/s/${data.sellerHandle}`} className="font-bold">
                {data.sellerName}
              </Link>
            </p>
          </header>

          {order.status === "CONFIRMED" && order.dispatchBy && <p className="card t-small p-3.5">The seller ships by {formatIST(order.dispatchBy)}.</p>}

          {cancelAt && <LateCancelButton orderId={order.id} availableAt={cancelAt.toISOString()} totalLabel={formatINR(order.totalPaise)} />}

          <ClaimSection
            orderId={order.id}
            claim={claim && { id: claim.id, status: claim.status, reason: claim.reason, description: claim.description, sellerResponse: claim.sellerResponse, photoUrls: claim.photoUrls, createdAt: claim.createdAt.toISOString() }}
            windowOpen={claimWin.open}
            windowClosesAt={claimWin.open && claimWin.closesAt ? claimWin.closesAt.toISOString() : null}
            deliveredMode={order.status === "DELIVERED"}
            sellerName={data.sellerName}
            reference={order.reference}
            firstItem={items[0] ? { title: items[0].snapshot.title, photoUrl: items[0].snapshot.photoUrl, category: items[0].snapshot.category } : null}
          />

          {reviewable.map((item) => (
            <ReviewForm key={item.id} orderItemId={item.id} title={item.snapshot.title} sellerName={data.sellerName} />
          ))}

          <section aria-labelledby="item-h" className="card flex flex-col gap-3 p-4">
            <h2 id="item-h" className="t-caption muted !font-bold">
              LISTING AS YOU BOUGHT IT
            </h2>
            {items.map((i) => (
              <SnapshotLine key={i.id} item={{ ...i.snapshot, pricePaise: i.pricePaise }} thumb={60} />
            ))}
          </section>

          <section aria-labelledby="tl-h" className="flex flex-col gap-2">
            <h2 id="tl-h" className="t-h2 mb-2">
              Timeline
            </h2>
            <BuyerTimeline steps={steps} />
            {shipment && (
              <div className="t-small flex flex-col gap-2">
                <p>
                  {shipment.courierName} · AWB <span className="t-mono !text-[13px]">{shipment.awb}</span>
                </p>
                {shipment.trackingUrl && (
                  <ButtonLink href={shipment.trackingUrl} target="_blank" rel="noopener" variant="secondary">
                    <ExternalLink aria-hidden className="ic" strokeWidth={1.75} />
                    Track with courier
                  </ButtonLink>
                )}
                {events.length > 0 && (
                  <ul className="flex flex-col gap-1 border-l-2 border-line pl-3">
                    {events.map((e) => (
                      <li key={e.id} className="muted">
                        <span className="font-semibold text-foreground">{e.description ?? e.status.replaceAll("_", " ").toLowerCase()}</span> · {[e.location, formatIST(e.occurredAt)].filter(Boolean).join(" · ")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section aria-labelledby="pd-h" className="card flex flex-col gap-3 p-4 lg:p-5">
            <h2 id="pd-h" className="t-h3">
              Payment and delivery
            </h2>
            <PriceSummary
              itemCount={items.length}
              subtotalPaise={order.subtotalPaise}
              shippingPaise={order.shippingPaise}
              totalPaise={order.totalPaise}
              totalLabel={order.status.startsWith("CANCELLED") ? "Refunding" : "Paid"}
            />
            <p className="t-small muted">Paid {formatIST(order.confirmedAt!)}</p>
            {a && (
              <p className="t-small">
                {a.name} · {[a.line1, a.line2].filter(Boolean).join(", ")}, {a.city}, {a.state} {a.pincode}
              </p>
            )}
          </section>
          <ProtectionNote />
        </aside>
      </div>
    </div>
  );
}
