import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getSellerListing } from "@yolt/core";
import { ListingEditor } from "@/components/seller/listing-editor";
import { db } from "@/lib/server/db";
import { getCurrentSeller } from "@/lib/server/session";

export const metadata: Metadata = { title: "Edit listing", robots: { index: false } };

const FROZEN: Record<string, string> = {
  RESERVED: "A buyer has reserved this item, so it can't be changed right now.",
  PAYMENT_PENDING: "A buyer is paying for this item, so it can't be changed right now.",
  SOLD: "This item is sold. Sold listings stay as they were so buyers see what they bought.",
  SOLD_ELSEWHERE: "You marked this as sold elsewhere.",
  SCHEDULED: "This item is locked into an upcoming drop.",
};

export default async function EditListingPage({ params }: PageProps<"/seller/listings/[id]">) {
  await connection();
  const current = await getCurrentSeller();
  if (!current) redirect("/dev?next=/seller/listings");
  const data = await getSellerListing(db, { sellerId: current.seller.id, listingId: (await params).id });
  if (!data) notFound();

  const frozen = FROZEN[data.listing.status];
  return (
    <div className="space-y-4">
      <Link href="/seller/listings" className="text-sm text-muted hover:underline">
        ← All listings
      </Link>
      {frozen ? (
        <p className="rounded-md border border-line bg-surface p-4 text-sm">{frozen}</p>
      ) : (
        <ListingEditor initial={data} kycVerified={current.seller.kycStatus === "VERIFIED"} />
      )}
    </div>
  );
}
