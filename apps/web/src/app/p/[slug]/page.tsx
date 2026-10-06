import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock } from "lucide-react";
import type { Measurements } from "@yolt/db";
import { getCategory, MEASUREMENT_LABELS, type MeasurementKey } from "@yolt/shared";
import { PincodeCheck } from "@/components/pincode-check";
import { ButtonLink } from "@/components/ui/button";
import { ICON_STROKE } from "@/components/ui/cx";
import { HangTag } from "@/components/ui/hang-tag";
import { listingBadge, StatusBadge } from "@/components/ui/status-badge";
import { Sticker } from "@/components/ui/sticker";
import { ConditionBlock, FlawList, ProtectionNote, SellerCard } from "@/components/product/detail-blocks";
import { DropCountdown } from "@/components/product/drop-countdown";
import { MeasurementTable, type MeasurementRow } from "@/components/product/measurement-table";
import { PhotoGallery } from "@/components/product/photo-gallery";
import { ProductActions, type ProductState } from "@/components/product/product-actions";
import { ProductRail } from "@/components/product/product-rail";
import { ShareButton } from "@/components/store/share-button";
import { CONDITION, formatIST, formatINR } from "@/lib/format";
import { getListing, getMoreFromStore, getSimilarListings, getStoreRating } from "@/lib/server/queries";
import { shippingCost } from "@/components/store/store-header";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const data = await getListing((await params).slug);
  return data ? { title: data.listing.title } : {};
}

/** What the seller measured, in the order the editor shows it. How each was taken is only said where it's unambiguous. */
const MEASURE_ORDER: MeasurementKey[] = ["chestCm", "waistCm", "hipCm", "shoulderCm", "sleeveCm", "lengthCm", "inseamCm", "footLengthCm"];
const HOW: Partial<Record<MeasurementKey, (basis: Measurements["basis"]) => string | null>> = {
  chestCm: (b) => (b === "FLAT" ? "flat, one side" : b === "AROUND" ? "around" : null),
  waistCm: (b) => (b === "FLAT" ? "flat, one side" : b === "AROUND" ? "around" : null),
  hipCm: (b) => (b === "FLAT" ? "flat, one side" : b === "AROUND" ? "around" : null),
  shoulderCm: () => "seam to seam",
  sleeveCm: () => "shoulder seam to cuff",
  inseamCm: () => "crotch to hem",
  footLengthCm: () => "heel to toe",
};

export default async function ProductPage({ params }: PageProps<"/p/[slug]">) {
  const data = await getListing((await params).slug);
  if (!data) notFound();
  const { listing: l, seller, drop, photos } = data;
  const [more, similar, rating] = await Promise.all([getMoreFromStore(seller.id, l.id), getSimilarListings(l.category, seller.id), getStoreRating(seller.id)]);

  const sold = l.status === "SOLD" || l.status === "SOLD_ELSEWHERE";
  const reserved = l.status === "RESERVED" || l.status === "PAYMENT_PENDING";
  const removed = l.status === "WITHDRAWN";
  const soon = l.status === "SCHEDULED";
  const state: ProductState = sold ? "sold" : reserved ? "reserved" : soon ? "soon" : "available";
  const badge = listingBadge(l.status);
  const category = getCategory(l.category);
  const authSensitive = category?.authSensitive === true || l.category === "luxury";
  const condition = CONDITION[l.condition];

  const rows: MeasurementRow[] = MEASURE_ORDER.flatMap((key) => {
    const cm = l.measurements[key];
    return typeof cm === "number" ? [{ key, label: MEASUREMENT_LABELS[key], how: HOW[key]?.(l.measurements.basis) ?? null, cm }] : [];
  });
  const flawPhotos = photos.filter((p) => p.kind === "FLAW").map((p) => ({ id: p.id, position: p.position }));
  const rails = (
    <>
      <ProductRail title={`More from ${seller.displayName}`} href={`/s/${seller.handle}`} items={more} />
      <ProductRail title="Similar pieces" href={`/search?cat=${l.category}`} items={similar} showSeller />
    </>
  );

  if (removed) {
    return (
      <div className="space-y-12 pb-8">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3.5 pt-8 text-center lg:pt-16">
          <span aria-hidden="true">
            <HangTag size="lg" ink className="-rotate-[8deg]">
              Removed
            </HangTag>
          </span>
          <h1 className="t-h1">No longer listed.</h1>
          <p className="t-body muted">{seller.displayName} took this piece down. Here&apos;s what they have in stock.</p>
          <ButtonLink href={`/s/${seller.handle}`}>See what&apos;s in stock at {seller.displayName}</ButtonLink>
          <ButtonLink href={`/search?cat=${l.category}`} variant="ghost">
            Find similar pieces
          </ButtonLink>
        </div>
        {rails}
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-28 lg:space-y-14 lg:pb-8">
      <div>
        <nav aria-label="Breadcrumb" className="t-small muted mb-3 hidden lg:block">
          <Link href="/">Home</Link> / <Link href={`/s/${seller.handle}`}>{seller.displayName}</Link>
          {category && (
            <>
              {" "}
              / <Link href={`/search?cat=${l.category}`}>{category.label}</Link>
            </>
          )}
        </nav>

        <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
          <div className="lg:col-span-7">
            <PhotoGallery
              photos={photos.map((p) => ({ id: p.id, url: p.url, kind: p.kind, caption: p.caption }))}
              title={l.title}
              category={l.category}
              muted={sold}
              status={sold ? "Sold out" : soon ? "Coming soon" : undefined}
            >
              <ShareButton title={l.title} label="Share" iconOnly />
            </PhotoGallery>
          </div>

          <div className="flex flex-col gap-4 lg:col-span-5 lg:gap-4">
            <div className="flex flex-col gap-2 lg:gap-4">
              <Link href={`/s/${seller.handle}`} className="t-small inline-flex min-h-11 items-center self-start font-bold lg:min-h-0">
                {seller.displayName}
              </Link>
              <h1 className="t-h1 !text-2xl !leading-[27px] lg:!text-4xl lg:!leading-[38px]">{l.title}</h1>
              <div className="flex flex-wrap items-center gap-3 lg:gap-3.5">
                <HangTag size="lg" ink>
                  {formatINR(l.pricePaise)}
                </HangTag>
                {badge && <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
                {state === "available" && <Sticker className="hidden lg:inline-flex">1 of 1</Sticker>}
              </div>
            </div>

            {reserved && (
              <div role="status" className="flex items-start gap-2.5 rounded-xl bg-surface-2 px-3.5 py-3">
                <Clock aria-hidden className="ic mt-px text-warning" strokeWidth={ICON_STROKE} />
                <p className="t-small">
                  Reserved by another buyer. It may become available again in a few minutes if they don&apos;t complete payment.
                </p>
              </div>
            )}
            {sold && (
              <div role="status" className="flex items-center gap-2.5 rounded-xl bg-[#0d0d0c] p-3.5 text-white">
                <span aria-hidden="true">
                  <Sticker>Sold out</Sticker>
                </span>
                <p className="t-body font-bold">
                  <span className="sr-only">Sold out. </span>This piece found a home.
                </p>
              </div>
            )}
            {soon && (
              <div role="status" className="flex flex-col gap-2.5 rounded-[14px] p-3.5 shadow-[inset_0_0_0_1.5px_var(--foreground)]">
                <p className="t-small font-bold">
                  Coming soon{drop ? ` in ${drop.title}, ${formatIST(drop.startsAt)}` : ""}
                </p>
                {drop && <DropCountdown startsAt={drop.startsAt.toISOString()} serverNow={new Date().toISOString()} />}
              </div>
            )}

            <ProductActions
              state={state}
              listingId={l.id}
              pricePaise={l.pricePaise}
              category={l.category}
              storeHandle={seller.handle}
              storeName={seller.displayName}
              dropId={drop?.id ?? null}
            />

            {condition && <ConditionBlock label={condition.label} meaning={condition.meaning} />}
            <MeasurementTable tagSize={l.tagSize} rows={rows} basis={rows.length ? l.measurements.basis : undefined} />
            <FlawList flaws={l.flaws} noFlawsConfirmed={l.noFlawsConfirmed} photos={flawPhotos} />

            {(l.brandDeclared || authSensitive) && (
              <p className="t-small">
                {l.brandDeclared && (
                  <>
                    <span className="muted">Brand:</span> <strong>{l.brandDeclared}</strong> <span className="muted">(declared by seller)</span>{" "}
                  </>
                )}
                {authSensitive && <span className="muted">Seller-declared, not authenticated by YOLT.</span>}
              </p>
            )}

            <SellerCard
              handle={seller.handle}
              name={seller.displayName}
              logoUrl={seller.logoUrl}
              dispatchDays={seller.dispatchDays}
              rating={rating}
              verified={seller.kycStatus === "VERIFIED"}
            />

            {!sold && (
              <section aria-label="Delivery" className="flex flex-col gap-2">
                <PincodeCheck listingId={l.id} />
                <p className="t-small">
                  {shippingCost(seller)} <span className="muted">from {seller.displayName}</span>
                </p>
              </section>
            )}

            <ProtectionNote />
          </div>
        </div>
      </div>

      {rails}
    </div>
  );
}
