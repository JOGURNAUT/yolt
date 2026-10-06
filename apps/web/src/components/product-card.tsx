import Link from "next/link";
import { CONDITION, formatIST, formatINR } from "@/lib/format";
import { formatDay as formatSoldDay } from "@/lib/store-format";
import type { ListingCard } from "@/lib/server/queries";
import { CardPhoto } from "./garment-image";
import { CardAction, SaveButton } from "./shop-buttons";
import { HangTag } from "./ui/hang-tag";
import { listingBadge, StatusBadge } from "./ui/status-badge";
import { Sticker } from "./ui/sticker";

/** A card's data. `backUrl` is the piece's BACK photo (every card source carries it); a piece without one just doesn't crossfade. */
export type CardItem = Omit<ListingCard, "backUrl" | "soldAt"> & { backUrl?: string | null; soldAt?: Date | null };

/**
 * ProductCard (board C4): 4:5 photo, hang-tag price, at most one sticker, the save heart, and on
 * desktop a hover that crossfades to the back photo and slides up an add bar. The whole card is one
 * link to the product page; phones have no hover, so nothing important hides behind it.
 */
export function ProductCard({
  item,
  showSeller = false,
  sticker,
  large = false,
}: {
  item: CardItem;
  showSeller?: boolean;
  /** A label for the sticker slot on pieces still for sale ("Trending", "1 of 1"). Sold and coming-soon pieces keep their own. */
  sticker?: { label: string; tone?: "accent" | "ink" | "pink" | "paper" };
  /** The bigger Grails treatment: larger corners, hang tag and title. */
  large?: boolean;
}) {
  const sold = item.status === "SOLD" || item.status === "SOLD_ELSEWHERE";
  const reserved = item.status === "RESERVED" || item.status === "PAYMENT_PENDING";
  const comingSoon = item.status === "SCHEDULED";
  const removed = item.status === "WITHDRAWN";
  const badge = reserved || removed ? listingBadge(item.status) : null;

  const meta = [
    comingSoon && item.dropStartsAt ? formatIST(item.dropStartsAt) : item.tagSize,
    sold && item.soldAt ? `Sold ${formatSoldDay(item.soldAt)}` : comingSoon ? null : CONDITION[item.condition]?.label,
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
    <Link href={`/p/${item.slug}`} className={`pc${sold ? " is-sold" : ""}${large ? " is-large" : ""}`}>
      <div className="media">
        <CardPhoto src={item.coverUrl} backSrc={item.backUrl} alt={item.title} category={item.category} />
        <span className="tagpos">
          <HangTag size={large ? "lg" : "md"}>{formatINR(item.pricePaise)}</HangTag>
        </span>
        {(sold || comingSoon) && (
          <span className="stk">
            <Sticker tone={sold ? "ink" : "accent"}>{sold ? "Sold out" : "Coming soon"}</Sticker>
          </span>
        )}
        {!sold && !comingSoon && sticker && (
          <span className="stk">
            <Sticker tone={sticker.tone ?? "accent"}>{sticker.label}</Sticker>
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

/** Mobile 2-up with a 12 px gap, 4-up from 1024 px, and from 1280 px a flush shelf 5 and then 6 across (see styles/wide.css). */
export function ProductGrid({ items, showSeller, beside = false }: { items: CardItem[]; showSeller?: boolean; /** Sits beside the search filter sidebar: runs flush to the right edge only. */ beside?: boolean }) {
  return (
    <div className={beside ? "shelf shelf-end" : "shelf"}>
      {items.map((item) => (
        <ProductCard key={item.id} item={item} showSeller={showSeller} />
      ))}
    </div>
  );
}
