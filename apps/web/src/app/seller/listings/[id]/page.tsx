import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Lock } from "lucide-react";
import { getSellerDrop, getSellerListing } from "@yolt/core";
import { GarmentImage } from "@/components/garment-image";
import { ListingEditor } from "@/components/seller/listing-editor";
import { BackLink } from "@/components/seller/page-header";
import { ICON_STROKE } from "@/components/ui/cx";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatINR } from "@/lib/format";
import { db } from "@/lib/server/db";
import { requireSeller } from "@/lib/server/session";

export const metadata: Metadata = { title: "Edit listing", robots: { index: false } };

const FROZEN: Record<string, string> = {
  RESERVED: "A buyer is paying for this item, so it can't be changed right now.",
  PAYMENT_PENDING: "A buyer is paying for this item, so it can't be changed right now.",
  SOLD: "This item is sold. Sold listings stay as they were so buyers see what they bought.",
  SOLD_ELSEWHERE: "You marked this as sold elsewhere. It stays as it was.",
};

export default async function EditListingPage({ params }: PageProps<"/seller/listings/[id]">) {
  await connection();
  const listingId = (await params).id;
  const current = await requireSeller(`/seller/listings/${listingId}`);
  const data = await getSellerListing(db, { sellerId: current.seller.id, listingId });
  if (!data) notFound();
  const { listing, photos } = data;

  let frozen = FROZEN[listing.status];
  let dropHref: string | null = null;
  if (listing.status === "SCHEDULED") {
    const drop = listing.dropId ? await getSellerDrop(db, { sellerId: current.seller.id, dropId: listing.dropId }) : null;
    frozen = drop ? `This piece is in ${drop.drop.title}. Changes are locked until it opens.` : "This item is locked into an upcoming drop. Changes are locked until it opens.";
    dropHref = drop ? `/seller/drops/${drop.drop.id}` : null;
  }

  return (
    <>
      <BackLink href="/seller/listings">All listings</BackLink>
      {frozen ? (
        <section aria-label="Locked listing" className="sec max-w-xl">
          <div className="flex items-start gap-3">
            <Lock aria-hidden className="ic mt-0.5" strokeWidth={ICON_STROKE} />
            <div className="space-y-1">
              <h1 className="t-h1">{listing.title ?? "Untitled listing"}</h1>
              <p className="t-body">{frozen}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
            <div className="w-12 shrink-0">
              <GarmentImage src={photos[0]?.url ?? null} alt={listing.title ?? "Listing"} category={listing.category ?? "draft"} className="!rounded-lg" />
            </div>
            <span className="t-small flex flex-col gap-0.5">
              <span className="font-bold">{[listing.tagSize, listing.pricePaise !== null ? formatINR(listing.pricePaise) : null].filter(Boolean).join(" · ")}</span>
              <span>
                <StatusBadge tone={listing.status === "SCHEDULED" ? "soon" : listing.status.startsWith("SOLD") ? "soldout" : "reserved"}>
                  {listing.status === "SCHEDULED" ? "Scheduled" : listing.status.startsWith("SOLD") ? "Sold" : "Reserved"}
                </StatusBadge>
              </span>
            </span>
          </div>
          {dropHref && (
            <Link href={dropHref} className="t-small font-bold">
              Open the drop
            </Link>
          )}
        </section>
      ) : (
        <ListingEditor initial={{ listing, photos }} kycVerified={current.seller.kycStatus === "VERIFIED"} storeName={current.seller.displayName} />
      )}
    </>
  );
}
