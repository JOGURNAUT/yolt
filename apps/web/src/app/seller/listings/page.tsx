import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getSellerListings, getSellerTabCounts, SELLER_TABS, type SellerTab } from "@yolt/core";
import { ListingsTable } from "@/components/seller/listings-table";
import { MarkSoldButton } from "@/components/seller/mark-sold";
import { NewListingButton } from "@/components/seller/new-listing-button";
import { PageHeader } from "@/components/seller/page-header";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/format";
import { formatDay } from "@/lib/store-format";
import { db } from "@/lib/server/db";
import { requireSeller } from "@/lib/server/session";

export const metadata: Metadata = { title: "Your listings", robots: { index: false } };

const TAB_LABELS: Record<SellerTab, string> = {
  live: "Live",
  draft: "Drafts",
  reserved: "Reserved",
  "coming-soon": "Coming soon",
  sold: "Sold",
  withdrawn: "Withdrawn",
};

const EMPTY: Record<SellerTab, string> = {
  live: "Nothing is live. Publish a draft to put it on your store.",
  draft: "No drafts. Start a new listing to add one.",
  reserved: "Nothing is reserved. Pieces show here while a buyer is paying.",
  "coming-soon": "No pieces are waiting for a drop.",
  sold: "Nothing sold yet.",
  withdrawn: "Nothing withdrawn.",
};

export default async function SellerListingsPage({ searchParams }: PageProps<"/seller/listings">) {
  await connection();
  // Layouts and pages render concurrently, so each seller page checks the session itself.
  const current = await requireSeller("/seller/listings");
  const requested = (await searchParams).tab;
  const tab: SellerTab = typeof requested === "string" && requested in SELLER_TABS ? (requested as SellerTab) : "live";
  const sellerId = current.seller.id;
  const [items, counts, live, reserved] = await Promise.all([
    getSellerListings(db, { sellerId, tab }),
    getSellerTabCounts(db, sellerId),
    getSellerListings(db, { sellerId, tab: "live" }),
    getSellerListings(db, { sellerId, tab: "reserved" }),
  ]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const rows = items.map((l) => ({
    id: l.id,
    title: l.title,
    slug: l.slug,
    status: l.status,
    category: l.category,
    tagSize: l.tagSize,
    pricePaise: l.pricePaise,
    coverUrl: l.coverUrl,
    updated: formatDay(l.updatedAt),
  }));
  const soldCandidates = [
    ...live.map((l) => ({ id: l.id, title: l.title ?? "Untitled", meta: [l.tagSize, l.pricePaise !== null ? formatINR(l.pricePaise) : null].filter(Boolean).join(" · ") || "Live", coverUrl: l.coverUrl })),
    ...reserved.map((l) => ({ id: l.id, title: l.title ?? "Untitled", meta: "", coverUrl: l.coverUrl, locked: "Locked · a buyer is paying" })),
  ];

  return (
    <>
      <PageHeader
        title="Listings"
        actions={
          <>
            <MarkSoldButton items={soldCandidates} />
            <NewListingButton />
          </>
        }
      />

      <nav aria-label="Listing status" className="hscroll-bleed flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0 [scrollbar-width:none]">
        {(Object.keys(TAB_LABELS) as SellerTab[]).map((t) => (
          <Link
            key={t}
            href={t === "live" ? "/seller/listings" : `/seller/listings?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={cx("pill !no-underline", t === tab && "is-active")}
          >
            {TAB_LABELS[t]} <span className="n">{counts[t]}</span>
          </Link>
        ))}
      </nav>

      {total === 0 ? (
        <EmptyState tag="NEW" title="List your first piece" action={<NewListingButton label="Start a listing" />}>
          Add photos and measurements, tick that you checked for flaws, and publish. Your draft saves as you go.
        </EmptyState>
      ) : rows.length === 0 ? (
        <p className="t-small muted py-10 text-center">{EMPTY[tab]}</p>
      ) : (
        <ListingsTable rows={rows} selectable={tab === "live"} />
      )}
    </>
  );
}
