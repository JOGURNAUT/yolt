import { ExternalLink, Truck } from "lucide-react";
import type { sellers } from "@yolt/db";
import { FollowButton } from "@/components/follow-button";
import { Stars } from "@/components/stars";
import { ICON_STROKE } from "@/components/ui/cx";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { formatINR } from "@/lib/format";
import { formatCount, initials } from "@/lib/store-format";
import "@/styles/store.css";
import { DropTicket } from "./drop-ticket";
import { ShareButton } from "./share-button";

type Drop = Parameters<typeof DropTicket>[0]["drop"];

/** The shipping promise in one line, e.g. "Ships in 2 days · Shipping ₹79, free above ₹1,999". */
export function shippingLine(store: Pick<typeof sellers.$inferSelect, "dispatchDays" | "shippingFeePaise" | "freeShippingAbovePaise">) {
  const ships = `Ships in ${store.dispatchDays} ${store.dispatchDays === 1 ? "day" : "days"}`;
  if (store.shippingFeePaise === 0) return `${ships} · Free shipping`;
  const free = store.freeShippingAbovePaise !== null ? `, free above ${formatINR(store.freeShippingAbovePaise)}` : "";
  return `${ships} · Shipping ${formatINR(store.shippingFeePaise)}${free}`;
}

/**
 * StoreHeader (board C4): banner, logo, name, links, bio, rating and followers, follow and share,
 * the shipping line and the next drop. Images show when the seller has uploaded them, otherwise a
 * plain placeholder. Phones and desktop order the parts differently (see styles/store.css).
 */
export function StoreHeader({
  store,
  rating,
  followers,
  following,
  signedIn,
  isOwner,
  drop,
  reminderOn,
}: {
  store: typeof sellers.$inferSelect;
  rating: { average: number | null; total: number };
  followers: number;
  following: boolean;
  signedIn: boolean;
  isOwner: boolean;
  drop: Drop | null;
  reminderOn: boolean;
}) {
  const city = store.pickupCity ?? store.pickupState;
  return (
    <header>
      <div className="store-banner">
        {/* eslint-disable-next-line @next/next/no-img-element -- seller's uploaded banner, decorative */}
        {store.bannerUrl && <img src={store.bannerUrl} alt="" />}
      </div>
      <div className="store-head">
        <div className="store-logo">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- seller's uploaded logo
            <img src={store.logoUrl} alt="" />
          ) : (
            <span aria-hidden="true" className="wordmark">
              {initials(store.displayName)}
            </span>
          )}
        </div>

        <div className="store-actions">
          {!isOwner && <FollowButton key={String(following)} sellerId={store.id} following={following} followers={followers} signedIn={signedIn} showCount={false} className="[&_.btn]:h-11 [&_.btn]:px-[22px]" />}
          <ShareButton title={store.displayName} />
        </div>

        <div className="store-info space-y-3">
          <div className="space-y-1.5">
            <h1 className="t-h1">{store.displayName}</h1>
            <div className="t-small flex flex-wrap items-center gap-x-3 gap-y-1">
              {store.instagramHandle && (
                <a
                  href={`https://instagram.com/${store.instagramHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-6 items-center gap-1 font-bold"
                >
                  @{store.instagramHandle}
                  <ExternalLink aria-hidden className="ic ic-14" strokeWidth={ICON_STROKE} />
                  <span className="sr-only">(Instagram, opens in a new tab)</span>
                </a>
              )}
              {city && <span className="muted">{city}</span>}
              {store.kycStatus === "VERIFIED" && <VerifiedBadge />}
            </div>
          </div>
          {store.bio && <p className="t-body max-w-[520px]">{store.bio}</p>}
          <div className="t-small flex flex-wrap items-center gap-x-5 gap-y-1">
            {rating.average !== null ? (
              <a href="#reviews" className="inline-flex min-h-6 items-center gap-1.5 font-bold !no-underline">
                <Stars rating={rating.average} size={14} />
                {rating.average.toFixed(1)}
                <span className="muted font-medium">
                  ({rating.total} {rating.total === 1 ? "review" : "reviews"})
                </span>
              </a>
            ) : (
              <a href="#reviews" className="muted inline-flex min-h-6 items-center font-medium">
                No reviews yet
              </a>
            )}
            <span className="font-bold">
              {formatCount(followers)} <span className="muted font-medium">{followers === 1 ? "follower" : "followers"}</span>
            </span>
          </div>
          <p className="t-small flex items-center gap-2 rounded-xl bg-surface-2 p-3 lg:bg-transparent lg:p-0 lg:text-muted">
            <Truck aria-hidden className="ic ic-16 lg:hidden" strokeWidth={ICON_STROKE} />
            {shippingLine(store)}
          </p>
        </div>

        {drop && (
          <div className="store-ticket">
            <DropTicket drop={drop} storeName={store.displayName} reminderOn={reminderOn} signedIn={signedIn} />
          </div>
        )}
      </div>
    </header>
  );
}
