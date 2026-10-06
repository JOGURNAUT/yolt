import Link from "next/link";
import { CONDITION, formatIST, formatINR } from "@/lib/format";
import type { ListingCard } from "@/lib/server/queries";
import { CardPhoto } from "./garment-image";
import { CardAction, SaveButton } from "./shop-buttons";
import { HangTag } from "./ui/hang-tag";
import { listingBadge, StatusBadge } from "./ui/status-badge";
import { Sticker } from "./ui/sticker";

/** A card's data. The back photo is optional: search results don't carry one, so they just don't crossfade. */
export type CardItem = Omit<ListingCard, "backUrl"> & { backUrl?: string | null };

/**
 * ProductCard (board C4): 4:5 photo, hang-tag price, at most one sticker, the save heart, and on
 * desktop a hover that crossfades to the back photo and slides up an add bar. The whole card is one
 * link to the product page; phones have no hover, so nothing important hides behind it.
 */
export function ProductCard({ item, showSeller = false }: { item: CardItem; showSeller?: boolean }) {
  const sold = item.status === "SOLD" || item.status === "SOLD_ELSEWHERE";
  const reserved = item.status === "RESERVED" || item.status === "PAYMENT_PENDING";
  const comingSoon = item.status === "SCHEDULED";
  const removed = item.status === "WITHDRAWN";
  const badge = reserved || removed ? listingBadge(item.status) : null;

  const meta = [
    comingSoon && item.dropStartsAt ? formatIST(item.dropStartsAt) : item.tagSize,
    comingSoon ? null : CONDITION[item.condition]?.label,
    showSeller ? item.sellerName : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (removed) {
    return (
      <div className="pc is-removed">
        <div className="media">
          <div className="ph flex flex-col items-center justify-center gap-1.5 p-4 text-center">
            <span className="t-small muted">No longer listed.</span>
          </div>
        </div>
        {badge && <StatusBadge tone={badge.tone} className="self-start">{badge.label}</StatusBadge>}
        <p className="title">{item.title}</p>
      </div>
    );
  }

  return (
    <Link href={`/p/${item.slug}`} className={`pc${sold ? " is-sold" : ""}`}>
      <div className="media">
        <CardPhoto src={item.coverUrl} backSrc={item.backUrl} alt={item.title} category={item.category} />
        <span className="tagpos">
          <HangTag>{formatINR(item.pricePaise)}</HangTag>
        </span>
        {(sold || comingSoon) && (
          <span className="stk">
            <Sticker tone={sold ? "ink" : "accent"}>{sold ? "Sold out" : "Coming soon"}</Sticker>
          </span>
        )}
        <SaveButton listingId={item.id} />
        {item.status === "AVAILABLE" && <CardAction listingId={item.id} category={item.category} mode="add" />}
        {sold && <CardAction listingId={item.id} category={item.category} mode="similar" />}
      </div>
      {badge && <StatusBadge tone={badge.tone} className="self-start">{badge.label}</StatusBadge>}
      <p className="title">{item.title}</p>
      {meta && <p className="meta">{meta}</p>}
    </Link>
  );
}

/** Mobile 2-up with a 12 px gap, desktop 4-up with 24 (board C4). */
export function ProductGrid({ items, showSeller }: { items: CardItem[]; showSeller?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-8">
      {items.map((item) => (
        <ProductCard key={item.id} item={item} showSeller={showSeller} />
      ))}
    </div>
  );
}
