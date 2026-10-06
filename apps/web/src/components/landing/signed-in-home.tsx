import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { ICON_STROKE } from "@/components/ui/cx";
import {
  getDropsStrip,
  getFollowedSellerIds,
  getFreshFinds,
  getMyInYourSizes,
  getNewFromFollowed,
  getReminderSet,
  getStoresToDiscover,
} from "@/lib/server/queries";
import { FollowChip } from "./drop-clock";
import { DropsStrip, FreshFinds, ProductRow, Section, SectionHead, StoresToDiscover } from "./sections";

/** The signed-in home (board B2.2): less marketing, more of what's new for this buyer. */
export async function SignedInHome({ user }: { user: { userId: string; name: string | null } }) {
  const followedIds = await getFollowedSellerIds(user.userId);
  const [strip, fromFollowed, mine, fresh, stores, suggestions] = await Promise.all([
    getDropsStrip(),
    getNewFromFollowed(followedIds),
    getMyInYourSizes(user.userId),
    getFreshFinds(),
    getStoresToDiscover(3, followedIds),
    followedIds.length === 0 ? getStoresToDiscover(2) : Promise.resolve([]),
  ]);
  const reminders = await getReminderSet(user.userId, strip.drops.map((d) => d.id));
  const first = user.name?.trim().split(/\s+/)[0];

  return (
    <div className="page-wide">
      <section className="flex flex-col gap-1 lg:pt-2">
        <h1 className="t-display">{first ? `Hey ${first}` : "Welcome back"}</h1>
        <p className="t-body muted">Here&apos;s what&apos;s new since your last visit.</p>
      </section>

      {strip.drops.length > 0 && <DropsStrip drops={strip.drops} signedIn reminders={reminders} className="pt-6 lg:pt-10" />}

      <Section labelledBy="follow-h" className="!pt-8">
        <SectionHead id="follow-h" title="From stores you follow" />
        {followedIds.length === 0 ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-[inset_0_0_0_1px_var(--line)]">
            <p className="t-h3">Follow stores to see their new pieces here</p>
            {suggestions.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <span aria-hidden="true" className="wordmark flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0D0D0C] text-[13px] text-white">
                  {s.displayName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2)}
                </span>
                <Link href={`/s/${s.handle}`} className="flex min-w-0 grow flex-col no-underline">
                  <span className="t-small font-bold">{s.displayName}</span>
                  <span className="t-caption muted !font-medium">{[s.city, s.rating !== null ? `★ ${s.rating.toFixed(1)} (${s.reviewCount})` : "new on YOLT"].filter(Boolean).join(" · ")}</span>
                </Link>
                <FollowChip sellerId={s.id} name={s.displayName} following={false} signedIn className="!h-11" />
              </div>
            ))}
          </div>
        ) : fromFollowed.length === 0 ? (
          <p className="t-small muted">Nothing new from the stores you follow yet.</p>
        ) : (
          <Rail>
            {fromFollowed.map((item) => (
              <div key={item.id} className="w-[164px] lg:w-auto">
                <ProductCard item={item} showSeller />
              </div>
            ))}
          </Rail>
        )}
      </Section>

      <Section labelledBy="sizes-h" className="!pt-8">
        <SectionHead
          id="sizes-h"
          title="In your sizes"
          caption={mine.sizes.length > 0 ? mine.sizes.join(", ") : undefined}
          href={mine.sizes.length > 0 ? "/preferences" : undefined}
          linkLabel="Edit sizes"
        />
        {mine.sizes.length === 0 ? (
          <Link href="/preferences" className="flex flex-col overflow-hidden rounded-2xl bg-surface text-foreground no-underline shadow-[inset_0_0_0_1.5px_var(--foreground)]">
            <div aria-hidden="true" className="tape !h-6 !rounded-none" style={{ backgroundSize: "100% 10px, 100% 5px" }} />
            <span className="flex items-center gap-3 px-4 py-3.5">
              <span className="flex grow flex-col gap-0.5">
                <span className="t-h3">Set your sizes</span>
                <span className="t-small muted">One tap, and we&apos;ll show in-stock pieces tagged in your sizes.</span>
              </span>
              <ChevronRight aria-hidden className="ic ic-24" strokeWidth={ICON_STROKE} />
            </span>
          </Link>
        ) : mine.items.length === 0 ? (
          <p className="t-small muted">Nothing in stock in {mine.sizes.join(", ")} right now.</p>
        ) : (
          <Rail>
            {mine.items.map((item) => (
              <div key={item.id} className="w-[164px] lg:w-auto">
                <ProductCard item={item} showSeller />
              </div>
            ))}
          </Rail>
        )}
      </Section>

      <FreshFinds items={fresh} />
      <StoresToDiscover stores={stores} followed={new Set()} signedIn />
    </div>
  );
}

function Rail({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ProductRow className={className}>{children}</ProductRow>;
}
