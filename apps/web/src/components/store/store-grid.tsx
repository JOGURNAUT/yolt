import { ButtonLink } from "@/components/ui/button";
import { HangTag } from "@/components/ui/hang-tag";
import { ProductGrid } from "@/components/product-card";
import { FollowButton } from "@/components/follow-button";
import type { StockFilter } from "@/lib/server/queries";

type Items = Parameters<typeof ProductGrid>[0]["items"];

const COUNT_LINE: Record<StockFilter, (n: number) => string> = {
  "in-stock": (n) => `${n} ${n === 1 ? "piece" : "pieces"} · includes reserved`,
  "sold-out": (n) => `${n} sold · kept for reference, no buy button`,
  "coming-soon": (n) => `${n} ${n === 1 ? "piece" : "pieces"} in upcoming drops`,
};

const EMPTY: Record<StockFilter, { tag: string; title: string; body: string; follow: boolean }> = {
  "in-stock": { tag: "Soon", title: "Nothing in stock right now.", body: "Check Coming soon, or follow the store to hear about new pieces.", follow: true },
  "sold-out": { tag: "₹0", title: "Nothing sold yet.", body: "Pieces that sell stay here, so you can see what this store has found homes for.", follow: false },
  "coming-soon": { tag: "Soon", title: "Nothing coming soon yet.", body: "Follow to hear about the next drop.", follow: true },
};

/**
 * The grid under the stock pills (boards Store, StoreSold, StoreSoon, StoreEmpty): a count line,
 * the cards, "Show more" and the empty state for the selected pill. Sold out and coming soon cards
 * are drawn by ProductCard (muted, drop time).
 */
export function StoreGrid({
  filter,
  items,
  total,
  moreHref,
  follow,
}: {
  filter: StockFilter;
  items: Items;
  total: number;
  moreHref: string | null;
  follow: { sellerId: string; following: boolean; signedIn: boolean } | null;
}) {
  if (items.length === 0) {
    const e = EMPTY[filter];
    return (
      <div className="card flex flex-col items-center gap-3 px-5 py-8 text-center">
        <span aria-hidden="true">
          <HangTag size="lg" ink className="-rotate-[8deg]">
            {e.tag}
          </HangTag>
        </span>
        <p className="t-h3">{e.title}</p>
        <p className="t-small muted max-w-[360px]">{e.body}</p>
        {e.follow && follow && <FollowButton key={String(follow.following)} sellerId={follow.sellerId} following={follow.following} followers={0} signedIn={follow.signedIn} showCount={false} />}
      </div>
    );
  }
  const remaining = total - items.length;
  return (
    <>
      <p className="t-small muted">{COUNT_LINE[filter](total)}</p>
      <ProductGrid items={items} />
      {remaining > 0 && moreHref && (
        <div className="flex justify-center pt-1">
          <ButtonLink href={moreHref} scroll={false} variant="secondary" className="w-full sm:w-auto sm:min-w-[280px]">
            Show more · {remaining} more
          </ButtonLink>
        </div>
      )}
    </>
  );
}
