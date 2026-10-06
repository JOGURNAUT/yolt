import Link from "next/link";
import { ProductCard, type CardItem } from "@/components/product-card";

/** A row of cards under the product: a swipeable strip on phones (about 1.6 cards visible), five across on desktop. */
export function ProductRail({ title, href, items, showSeller = false }: { title: string; href: string; items: CardItem[]; showSeller?: boolean }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2.5 lg:space-y-4">
      <div className="sec-head">
        <h2 className="t-h2">{title}</h2>
        <Link href={href} className="t-small inline-flex min-h-11 whitespace-nowrap items-center font-bold" aria-label={`See all: ${title}`}>
          See all
        </Link>
      </div>
      <div className="hscroll -mx-4 lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-6 lg:overflow-visible lg:p-0">
        {items.map((item) => (
          <div key={item.id} className="w-[148px] lg:w-auto">
            <ProductCard item={item} showSeller={showSeller} />
          </div>
        ))}
      </div>
    </section>
  );
}
