import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { ICON_STROKE } from "@/components/ui/cx";
import type { SearchStoreRow } from "@/lib/server/queries";

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

/** The line under a store's name: where it is, then how it's doing. Ratings only when there are reviews. */
export function storeFacts(s: Pick<SearchStoreRow, "rating" | "reviewCount" | "inStock">) {
  return s.rating !== null && s.reviewCount > 0
    ? `★ ${s.rating.toFixed(1)} (${s.reviewCount}) · ${s.inStock} in stock`
    : `New on YOLT · ${s.inStock} in stock`;
}

/** A store in the Stores tab (board Search): avatar, name, place, rating and stock. The whole row opens the store. */
export function StoreRow({ store }: { store: SearchStoreRow }) {
  const where = [store.city, store.bio].filter(Boolean).join(" · ");
  return (
    <Link href={`/s/${store.handle}`} className="card flex min-h-[72px] items-center gap-3 px-3.5 py-3 !no-underline" style={{ color: "inherit" }}>
      <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#0D0D0C] text-white">
        <span className="wordmark text-sm">{initials(store.displayName)}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="t-h3">{store.displayName}</span>
        {where && <span className="t-small muted line-clamp-1">{where}</span>}
        <span className="t-caption font-bold">{storeFacts(store)}</span>
      </span>
      <ChevronRight aria-hidden className="ic" strokeWidth={ICON_STROKE} />
    </Link>
  );
}
