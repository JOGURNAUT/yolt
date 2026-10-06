import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AlertCircle, ChevronRight, Package, PencilLine, ShieldAlert, Ticket, Wallet } from "lucide-react";
import {
  getOpenClaimsForSeller,
  getPayoutStatement,
  getSellerListing,
  getSellerListings,
  getSellerOrders,
  getSellerTabCounts,
  listSellerDrops,
} from "@yolt/core";
import { GarmentImage } from "@/components/garment-image";
import { MarkSoldButton } from "@/components/seller/mark-sold";
import { NewListingButton } from "@/components/seller/new-listing-button";
import { PageHeader } from "@/components/seller/page-header";
import { ShareLinkButton } from "@/components/seller/share-link-button";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatINR, formatIST } from "@/lib/format";
import { CLAIM_REASON_LABELS, STORE_LINK_TOOLTIP, timeLeft } from "@/lib/seller-format";
import { db } from "@/lib/server/db";
import { requireSeller } from "@/lib/server/session";

export const metadata: Metadata = { title: "Seller overview", robots: { index: false } };

const istParts = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
const istHour = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" });

function greeting(now: Date) {
  const h = Number(istHour.format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function SellerHomePage() {
  await connection();
  const current = await requireSeller("/seller");
  const sellerId = current.seller.id;
  const now = new Date();

  const [toShip, claims, drafts, live, reserved, drops, payouts, counts] = await Promise.all([
    getSellerOrders(db, { sellerId, tab: "to-ship" }),
    getOpenClaimsForSeller(db, sellerId),
    getSellerListings(db, { sellerId, tab: "draft" }),
    getSellerListings(db, { sellerId, tab: "live" }),
    getSellerListings(db, { sellerId, tab: "reserved" }),
    listSellerDrops(db, sellerId),
    getPayoutStatement(db, { sellerId, pageSize: 1 }),
    getSellerTabCounts(db, sellerId),
  ]);

  // What each of the first few drafts still needs, from the same checklist the editor shows.
  const draftRows = await Promise.all(
    drafts.slice(0, 3).map(async (d) => {
      const full = await getSellerListing(db, { sellerId, listingId: d.id });
      return { draft: d, missing: full?.readiness.missing[0]?.message ?? "Ready to publish." };
    }),
  );
  const nextDrop = drops.filter((d) => ["SCHEDULED", "LIVE"].includes(d.drop.status)).sort((a, b) => +a.drop.startsAt - +b.drop.startsAt)[0];
  const overdue = toShip.filter((o) => o.overdue).length;
  const totalListings = Object.values(counts).reduce((a, b) => a + b, 0);

  const soldCandidates = [
    ...live.map((l) => ({ id: l.id, title: l.title ?? "Untitled", meta: [l.tagSize, l.pricePaise !== null ? formatINR(l.pricePaise) : null].filter(Boolean).join(" · ") || "Live", coverUrl: l.coverUrl })),
    ...reserved.map((l) => ({ id: l.id, title: l.title ?? "Untitled", meta: "", coverUrl: l.coverUrl, locked: "Locked · a buyer is paying" })),
  ];

  const todo = [
    {
      key: "orders",
      kicker: "Orders",
      icon: Package,
      value: toShip.length === 0 ? "Nothing to pack" : `${toShip.length} to pack`,
      sub:
        toShip.length === 0
          ? "New paid orders show up here."
          : overdue > 0
            ? `${overdue} overdue. Buyers can cancel a late order.`
            : `Ship by ${formatIST(toShip[0]!.dispatchBy ?? now)}.`,
      cta: "Open orders",
      href: "/seller/orders",
      emphasis: toShip.length > 0,
      alert: overdue > 0,
    },
    {
      key: "reports",
      kicker: "Buyer reports",
      icon: ShieldAlert,
      value: claims.length === 0 ? "No open reports" : `${claims.length} to answer`,
      sub: claims.length === 0 ? "Reports about an order land here." : "Accept and refund, or explain your side.",
      cta: claims.length === 0 ? "See orders" : "Respond",
      href: claims[0] ? `/seller/orders/${claims[0].claim.orderId}` : "/seller/orders?tab=issues",
      emphasis: claims.length > 0,
      alert: claims.length > 0,
    },
    {
      key: "drafts",
      kicker: "Drafts",
      icon: PencilLine,
      value: drafts.length === 0 ? "No drafts" : `${drafts.length} to finish`,
      sub: drafts.length === 0 ? "Start a listing any time." : "Each one shows what it still needs.",
      cta: "Open drafts",
      href: "/seller/listings?tab=draft",
    },
    {
      key: "drop",
      kicker: "Next drop",
      icon: Ticket,
      value: nextDrop ? formatIST(nextDrop.drop.startsAt) : "None scheduled",
      sub: nextDrop ? `${nextDrop.drop.title} · ${nextDrop.items} ${nextDrop.items === 1 ? "piece" : "pieces"}` : "Schedule a drop to get followers back on a date.",
      cta: nextDrop ? "View drop" : "Plan a drop",
      href: nextDrop ? `/seller/drops/${nextDrop.drop.id}` : "/seller/drops",
    },
  ];

  return (
    <>
      <PageHeader
        kicker={istParts.format(now)}
        title={`${greeting(now)}, ${current.seller.displayName}`}
        actions={
          <>
            <MarkSoldButton items={soldCandidates} />
            <NewListingButton />
          </>
        }
      />

      {totalListings === 0 && (
        <EmptyState tag="NEW" title="List your first piece" action={<NewListingButton />}>
          Photos, measurements and honest flaws are all a buyer needs. Autosave keeps your draft as you go.
        </EmptyState>
      )}

      <section aria-label="To do" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {todo.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={cx("card flex flex-col gap-2 p-4 !no-underline lg:p-[18px]", t.emphasis && "!shadow-[inset_0_0_0_2px_var(--foreground)]")}
            style={{ color: "inherit" }}
          >
            <span className="flex items-center justify-between">
              <span className="t-caption muted uppercase">{t.kicker}</span>
              <t.icon aria-hidden className="ic" strokeWidth={ICON_STROKE} />
            </span>
            <span className="t-h2 !normal-case">{t.value}</span>
            <span className="t-small muted grow">{t.sub}</span>
            <span className="t-small font-bold underline decoration-accent decoration-2 underline-offset-[3px]">{t.cta}</span>
          </Link>
        ))}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <section aria-labelledby="ship-h" className="card flex flex-col p-4 lg:p-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="ship-h" className="t-h2">
                Orders to ship
              </h2>
              <Link href="/seller/orders" className="btn btn-sm btn-ghost !h-11 !px-0">
                All orders
              </Link>
            </div>
            {toShip.length === 0 ? (
              <p className="t-small muted border-t border-line py-4">Nothing to ship right now.</p>
            ) : (
              <ul>
                {toShip.slice(0, 5).map((o) => (
                  <li key={o.id} className="border-t border-line">
                    <Link href={`/seller/orders/${o.id}`} className="flex min-h-14 items-center gap-3 py-3 !no-underline" style={{ color: "inherit" }}>
                      <span className="flex min-w-0 grow flex-col gap-0.5">
                        <span className="t-small line-clamp-1 font-bold">
                          {o.firstItem.title}
                          {o.itemCount > 1 && <span className="muted font-medium"> + {o.itemCount - 1} more</span>}
                        </span>
                        <span className="t-caption muted !font-medium">
                          {o.reference} · {o.shippingAddress?.city ?? "No address"} · {formatINR(o.totalPaise)}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        {o.overdue && (
                          <StatusBadge tone="danger">
                            <AlertCircle aria-hidden className="ic ic-14" strokeWidth={ICON_STROKE} />
                            Overdue
                          </StatusBadge>
                        )}
                        {o.dispatchBy && <span className={cx("t-caption", o.overdue && "text-danger")}>{timeLeft(o.dispatchBy, now)}</span>}
                      </span>
                      <ChevronRight aria-hidden className="ic ic-16 shrink-0" strokeWidth={ICON_STROKE} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {claims.length > 0 && (
            <section aria-labelledby="reports-h" className="card flex flex-col p-4 !shadow-[inset_0_0_0_2px_var(--danger)] lg:p-5">
              <h2 id="reports-h" className="t-h2 mb-2">
                Buyer reports to answer
              </h2>
              <ul>
                {claims.slice(0, 5).map(({ claim, reference }) => (
                  <li key={claim.id} className="border-t border-line">
                    <Link href={`/seller/orders/${claim.orderId}`} className="flex min-h-14 items-center gap-3 py-3 !no-underline" style={{ color: "inherit" }}>
                      <span className="flex min-w-0 grow flex-col gap-0.5">
                        <span className="t-small font-bold">{CLAIM_REASON_LABELS[claim.reason] ?? claim.reason}</span>
                        <span className="t-caption muted !font-medium">
                          {reference} · reported {formatIST(claim.createdAt)}
                        </span>
                      </span>
                      <StatusBadge tone="danger">Report open</StatusBadge>
                      <ChevronRight aria-hidden className="ic ic-16 shrink-0" strokeWidth={ICON_STROKE} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="drafts-h" className="card flex flex-col p-4 lg:p-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="drafts-h" className="t-h2">
                Drafts to finish
              </h2>
              <Link href="/seller/listings?tab=draft" className="btn btn-sm btn-ghost !h-11 !px-0">
                All drafts
              </Link>
            </div>
            {draftRows.length === 0 ? (
              <p className="t-small muted border-t border-line py-4">No drafts. Start a new listing to add one.</p>
            ) : (
              <ul>
                {draftRows.map(({ draft: d, missing }) => (
                  <li key={d.id} className="border-t border-line">
                    <Link href={`/seller/listings/${d.id}`} className="flex min-h-[72px] items-center gap-3.5 py-3 !no-underline" style={{ color: "inherit" }}>
                      <GarmentImage src={d.coverUrl} alt={d.title ?? "Untitled draft"} category="draft" className="!w-11 !rounded-lg" />
                      <span className="flex min-w-0 grow flex-col gap-0.5">
                        <span className="t-small line-clamp-1 font-bold">{d.title ?? "Untitled draft"}</span>
                        <span className="t-small muted">{[d.tagSize, d.pricePaise !== null ? formatINR(d.pricePaise) : null].filter(Boolean).join(" · ") || "Not filled in yet"}</span>
                        <span className="t-small flex items-start gap-1.5 font-semibold">
                          <AlertCircle aria-hidden className="ic ic-16 mt-0.5" strokeWidth={ICON_STROKE} />
                          {missing}
                        </span>
                      </span>
                      <ChevronRight aria-hidden className="ic ic-16 shrink-0" strokeWidth={ICON_STROKE} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section aria-labelledby="share-h" className="card flex flex-col gap-2.5 p-5">
            <h2 id="share-h" className="t-h3 !normal-case">
              Your store link
            </h2>
            <p className="t-small muted">Put it in your Instagram bio so buyers pay safely through YOLT. {STORE_LINK_TOOLTIP}</p>
            <div>
              <ShareLinkButton path={`/s/${current.seller.handle}`} sellerHandle={current.seller.handle} label="Copy store link" tooltip={STORE_LINK_TOOLTIP} />
            </div>
          </section>

          <section aria-labelledby="pay-h" className="card flex flex-col gap-2.5 p-5">
            <h2 id="pay-h" className="t-h3 !normal-case flex items-center gap-2">
              <Wallet aria-hidden className="ic" strokeWidth={ICON_STROKE} />
              Payouts
            </h2>
            <p className="t-h2 !normal-case">{formatINR(payouts.balances.availablePaise)} available</p>
            <p className="t-small muted">
              {formatINR(payouts.balances.pendingPaise)} more once the buyer-protection window closes. Commission ₹0 · Pilot: no commission.
            </p>
            <Link href="/seller/payouts" className="btn btn-sm btn-ghost !h-11 self-start !px-0">
              View payouts
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}
