import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSellerListings, getSellerTabCounts, SELLER_TABS, type SellerTab } from "@yolt/core";
import { ListingActions } from "@/components/seller/listing-actions";
import { NewListingButton } from "@/components/seller/new-listing-button";
import { GarmentImage } from "@/components/garment-image";
import { formatINR } from "@/lib/format";
import { db } from "@/lib/server/db";
import { getCurrentSeller } from "@/lib/server/session";

export const metadata: Metadata = { title: "Your listings", robots: { index: false } };

const TAB_LABELS: Record<SellerTab, string> = {
  live: "Live",
  draft: "Drafts",
  reserved: "Reserved",
  "coming-soon": "Coming soon",
  sold: "Sold",
  withdrawn: "Withdrawn",
};

export default async function SellerListingsPage({ searchParams }: PageProps<"/seller/listings">) {
  await connection();
  // Layouts and pages render concurrently, so each seller page checks the session itself.
  const current = await getCurrentSeller();
  if (!current) redirect("/dev?next=/seller/listings");
  const requested = (await searchParams).tab;
  const tab: SellerTab = typeof requested === "string" && requested in SELLER_TABS ? (requested as SellerTab) : "live";
  const sellerId = current.seller.id;
  const [items, counts] = await Promise.all([getSellerListings(db, { sellerId, tab }), getSellerTabCounts(db, sellerId)]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Listings</h1>
        <NewListingButton />
      </div>

      <nav aria-label="Listing status" className="flex gap-2 overflow-x-auto pb-1">
        {(Object.keys(TAB_LABELS) as SellerTab[]).map((t) => (
          <Link
            key={t}
            href={t === "live" ? "/seller/listings" : `/seller/listings?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
              t === tab ? "border-foreground bg-foreground text-background" : "border-line"
            }`}
          >
            {TAB_LABELS[t]} <span className={t === tab ? "opacity-80" : "text-muted"}>{counts[t]}</span>
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          {tab === "draft" ? "No drafts. Start a new listing to add one." : `Nothing in ${TAB_LABELS[tab].toLowerCase()}.`}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {items.map((l) => (
            <li key={l.id} className="flex items-center gap-3 p-3">
              <div className="w-14 shrink-0 overflow-hidden rounded">
                <GarmentImage src={l.coverUrl} alt={l.title ?? "Untitled draft"} category={l.category ?? "draft"} />
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/seller/listings/${l.id}`} className="line-clamp-1 font-medium hover:underline">
                  {l.title ?? "Untitled draft"}
                </Link>
                <p className="text-sm text-muted">
                  {[l.tagSize, l.pricePaise !== null ? formatINR(l.pricePaise) : null].filter(Boolean).join(" · ") || "Not filled in yet"}
                </p>
              </div>
              <ListingActions listingId={l.id} status={l.status} slug={l.slug} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
