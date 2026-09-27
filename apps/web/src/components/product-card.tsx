import Link from "next/link";
import { CONDITION, formatIST, formatINR } from "@/lib/format";
import type { ListingCard } from "@/lib/server/queries";
import { GarmentImage } from "./garment-image";
import { SaveButton } from "./shop-buttons";

export function ProductCard({ item, showSeller = false }: { item: ListingCard; showSeller?: boolean }) {
  const sold = item.status === "SOLD" || item.status === "SOLD_ELSEWHERE";
  const reserved = item.status === "RESERVED" || item.status === "PAYMENT_PENDING";
  const comingSoon = item.status === "SCHEDULED";

  return (
    <Link href={`/p/${item.slug}`} className="group block">
      <div className={`relative overflow-hidden rounded-lg ${sold ? "opacity-60" : ""}`}>
        <GarmentImage src={item.coverUrl} alt={item.title} category={item.category} />
        {sold && <Badge>Sold out</Badge>}
        <SaveButton listingId={item.id} className="absolute right-2 top-2" />
        {reserved && <Badge>Reserved</Badge>}
        {comingSoon && <Badge>{item.dropStartsAt ? `Drops ${formatIST(item.dropStartsAt)}` : "Coming soon"}</Badge>}
      </div>
      <div className="mt-2 space-y-0.5 text-sm">
        <p className="line-clamp-1 font-medium group-hover:underline">{item.title}</p>
        <p className="text-muted">
          {[item.tagSize, CONDITION[item.condition]?.label].filter(Boolean).join(" · ")}
        </p>
        <p className="font-semibold">{formatINR(item.pricePaise)}</p>
        {showSeller && <p className="text-xs text-muted">{item.sellerName}</p>}
      </div>
    </Link>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute left-2 top-2 rounded-full bg-surface px-2 py-0.5 text-xs font-medium shadow-sm">
      {children}
    </span>
  );
}

export function ProductGrid({ items, showSeller }: { items: ListingCard[]; showSeller?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <ProductCard key={item.id} item={item} showSeller={showSeller} />
      ))}
    </div>
  );
}
