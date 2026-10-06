import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import type { StoreCardData } from "@/lib/server/queries";
import { GarmentImage } from "@/components/garment-image";
import { ICON_STROKE } from "@/components/ui/cx";
import { FollowChip } from "./drop-clock";

/**
 * StoreCard (board C4): cover, avatar, name, city and niche, identity badge, rating, three recent
 * pieces and Follow. The whole card opens the store; Follow sits above that link.
 */
export function StoreCard({ store, following, signedIn }: { store: StoreCardData; following: boolean; signedIn: boolean }) {
  const initials = store.displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  const where = [store.city, store.bio].filter(Boolean).join(" · ");
  return (
    <article className="card relative flex h-full flex-col overflow-hidden">
      <div className="relative h-[84px] bg-surface-2 lg:h-[110px]">
        {store.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- the store's own cover, decorative
          <img src={store.bannerUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex flex-col gap-2.5 px-3.5 pb-3.5 lg:gap-3 lg:px-[18px] lg:pb-[18px]">
        <span className="relative -mt-6 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[#0D0D0C] text-white shadow-[0_0_0_3px_var(--surface)] lg:-mt-7 lg:h-14 lg:w-14">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the store's own logo
            <img src={store.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden="true" className="wordmark text-sm">
              {initials}
            </span>
          )}
        </span>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="t-h3 flex items-center gap-1">
              <Link href={`/s/${store.handle}`} className="truncate no-underline after:absolute after:inset-0 after:content-['']">
                {store.displayName}
              </Link>
              {store.instagramVerified && <BadgeCheck aria-label="Instagram verified" role="img" className="ic ic-16 shrink-0 fill-accent" strokeWidth={ICON_STROKE} />}
            </h3>
            {where && <p className="t-small muted line-clamp-1">{where}</p>}
            <p className="t-small font-bold">
              {store.rating !== null ? `★ ${store.rating.toFixed(1)} (${store.reviewCount} ${store.reviewCount === 1 ? "review" : "reviews"})` : "New on YOLT · no reviews yet"}
            </p>
          </div>
          <FollowChip sellerId={store.id} name={store.displayName} following={following} signedIn={signedIn} className="relative z-10 shrink-0 !h-11" />
        </div>
        <div aria-hidden="true" className="grid grid-cols-3 gap-1.5 lg:gap-2">
          {store.thumbs.map((t, i) => (
            <GarmentImage key={i} src={t.coverUrl} alt="" category={t.category} className="!rounded-[10px]" />
          ))}
        </div>
      </div>
    </article>
  );
}
