import { Camera, ChevronRight, Check, Ruler, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ProductCard, type CardItem } from "@/components/product-card";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { HangTag } from "@/components/ui/hang-tag";
import { Sticker } from "@/components/ui/sticker";
import { formatINR } from "@/lib/format";
import type { DropTicketData, StoreCardData } from "@/lib/server/queries";
import { DropTicket } from "./drop-ticket";
import { SILHOUETTE } from "./silhouettes";
import { StoreCard } from "./store-card";

/** A landing section: 40 px below the previous one on phones, 64 px on desktop. */
export function Section({ id, labelledBy, className, children }: { id?: string; labelledBy: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cx("scroll-mt-28 pt-10 lg:pt-16", className)}>
      {children}
    </section>
  );
}

/** Heading, optional caption (under the title on phones, beside it on desktop) and a "See all" link. */
export function SectionHead({ id, title, caption, href, linkLabel = "See all" }: { id: string; title: string; caption?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 lg:mb-4">
      <div className="flex flex-col gap-0.5 lg:flex-row lg:items-baseline lg:gap-3.5">
        <h2 id={id} className="t-h2">
          {title}
        </h2>
        {caption && <p className="t-caption muted lg:text-sm">{caption}</p>}
      </div>
      {href && (
        <Link href={href} className="t-small flex min-h-11 shrink-0 items-center font-bold">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

/** Phones: a row that scrolls sideways to the screen edge. Desktop: the same children as a grid. */
function Scroller({ children, desktopCols, className }: { children: React.ReactNode; desktopCols: string; className?: string }) {
  return <div className={cx("hscroll hscroll-bleed lg:grid lg:gap-6 lg:overflow-visible lg:px-0", desktopCols, className)}>{children}</div>;
}

// ---------------------------------------------------------------------------

/** Trending now: the most-saved pieces, or the newest under "Just dropped" when saves are too thin. */
export function TrendingSection({ mode, items }: { mode: "TRENDING" | "JUST_DROPPED"; items: CardItem[] }) {
  const trending = mode === "TRENDING";
  return (
    <section aria-labelledby="trend-h" className="pt-4 lg:pt-5">
      <SectionHead id="trend-h" title={trending ? "Trending now" : "Just dropped"} caption={trending ? "Most saved this week" : "Newest pieces first"} href="/search?sort=newest" />
      <Scroller desktopCols="lg:grid-cols-5">
        {items.map((item, i) => (
          <div key={item.id} className={cx("w-[164px] lg:w-auto", i >= 5 && "lg:hidden")}>
            {/* only the first few of a most-saved list carry the sticker, to keep the row calm */}
            <ProductCard item={item} sticker={trending && i < 3 ? { label: "Trending", tone: "pink" } : undefined} />
          </div>
        ))}
      </Scroller>
    </section>
  );
}

/** Grails: staff-picked one-of-ones. On desktop the hero rail already shows the first two, so the grid shows the rest. */
export function GrailsSection({ items, railShown }: { items: CardItem[]; railShown: boolean }) {
  if (items.length === 0) return null;
  const hiddenOnDesktop = railShown ? 2 : 0;
  return (
    <Section labelledBy="grails-h" className={cx(items.length <= hiddenOnDesktop && "lg:hidden")}>
      <SectionHead id="grails-h" title="Grails" caption="Picked by YOLT · one of one, every time" href="/search?sort=newest" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-6">
        {items.map((item, i) => (
          <div key={item.id} className={cx(i === 0 && "col-span-2 lg:col-span-1", i < hiddenOnDesktop && "lg:hidden")}>
            <ProductCard item={item} large showSeller sticker={{ label: "1 of 1" }} />
          </div>
        ))}
      </div>
    </Section>
  );
}

/** The hero's desktop rail: the first two Grails as compact cards. */
export function GrailsRail({ items }: { items: CardItem[] }) {
  return (
    <aside aria-label="Grails picked by YOLT" className="hidden h-[348px] flex-col gap-6 lg:col-span-4 lg:flex">
      {items.slice(0, 2).map((g) => (
        <Link key={g.id} href={`/p/${g.slug}`} className="card flex flex-1 gap-4 rounded-[20px] p-3 text-foreground no-underline">
          <div className="ph !h-[138px] !w-[110px] shrink-0 !rounded-xl">
            <div className="shot">
              {g.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- switch to next/image once the media loader exists
                <img src={g.coverUrl} alt="" loading="lazy" />
              ) : (
                <span className="t-caption uppercase muted">{g.category}</span>
              )}
            </div>
          </div>
          <div className="flex min-w-0 flex-col justify-between py-1">
            <div className="flex flex-col items-start gap-1.5">
              <Sticker>1 of 1</Sticker>
              <span className="t-caption muted mt-1">Grail · picked by YOLT</span>
              <span className="t-h3 line-clamp-2">{g.title}</span>
              <span className="t-small muted">{[g.tagSize, g.sellerName].filter(Boolean).join(" · ")}</span>
            </div>
            <HangTag ink>{formatINR(g.pricePaise)}</HangTag>
          </div>
        </Link>
      ))}
    </aside>
  );
}

/** Drops strip: ticket stubs for live and upcoming drops. Not rendered when there are none. */
export function DropsStrip({ drops, signedIn, reminders, className }: { drops: DropTicketData[]; signedIn: boolean; reminders: Set<string>; className?: string }) {
  if (drops.length === 0) return null;
  return (
    <section aria-labelledby="drops-h" className={cx("flex flex-col", className)}>
      <SectionHead id="drops-h" title="Drops" href="/drops" linkLabel="All drops" />
      <div className="flex flex-1 flex-col gap-3 lg:gap-4">
        {drops.map((d) => (
          <DropTicket key={d.id} drop={d} signedIn={signedIn} reminderOn={reminders.has(d.id)} className="flex-1" />
        ))}
      </div>
    </section>
  );
}

/** Fresh finds: the newest pieces, closed with a tile to the full list. */
export function FreshFinds({ items, count = 7 }: { items: CardItem[]; count?: number }) {
  return (
    <Section labelledBy="fresh-h">
      <SectionHead id="fresh-h" title="Fresh finds" href="/search?sort=newest" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-[22px] lg:grid-cols-4 lg:gap-x-6 lg:gap-y-8">
        {items.slice(0, count).map((item) => (
          <ProductCard key={item.id} item={item} showSeller />
        ))}
        <Link href="/search?sort=newest" className="flex aspect-[4/5] flex-col justify-between rounded-2xl bg-[#0D0D0C] p-4 text-white no-underline lg:p-[22px]">
          <span className="self-start">
            <Sticker>1 of 1</Sticker>
          </span>
          <span className="t-h1 !text-[22px] !leading-6 text-white lg:!text-[36px] lg:!leading-[38px]">See all fresh finds</span>
          <ChevronRight aria-hidden className="ic ic-24 text-[#C8B6FF]" strokeWidth={ICON_STROKE} />
        </Link>
      </div>
    </Section>
  );
}

const WHY = [
  { icon: Ruler, title: "Measured, not guessed", body: "Every piece is measured flat, so you can check it against something you already own." },
  { icon: Camera, title: "Every flaw shown", body: "Stains, fades and repairs are listed and photographed up close. No surprises." },
  {
    icon: ShieldCheck,
    title: "Your money protected",
    body: "You pay YOLT, never a personal UPI QR. Full refund if it isn’t as described, arrives damaged, or never arrives.",
    link: true,
  },
] as const;

/** Why YOLT: three honest promises, no numbers. */
export function WhyYolt() {
  return (
    <Section labelledBy="why-h" className="lg:pt-[72px]">
      <h2 id="why-h" className="t-h2 mb-3.5 lg:mb-4">
        Why YOLT
      </h2>
      <ul className="grid gap-3.5 lg:grid-cols-3 lg:gap-6">
        {WHY.map(({ icon: Icon, title, body, ...rest }) => (
          <li key={title} className="flex items-start gap-3.5 rounded-2xl bg-surface p-4 shadow-[inset_0_0_0_1px_var(--line)] lg:flex-col lg:gap-2.5 lg:rounded-[20px] lg:p-6">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent lg:h-12 lg:w-12 lg:rounded-[14px]">
              <Icon aria-hidden className="ic ic-24" strokeWidth={ICON_STROKE} />
            </span>
            <div className="flex flex-col gap-1">
              <h3 className="t-h3">{title}</h3>
              <p className="t-small muted lg:text-[15px]">{body}</p>
              {"link" in rest && (
                <Link href="/legal/buyer-protection" className="t-small flex min-h-11 items-center font-bold">
                  Buyer protection
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Rupee ranges as search's `price=min-max` (no strike-through prices: thrift has no MRP). */
const PRICES = [
  { label: "Under ₹499", query: "-499" },
  { label: "Under ₹999", query: "-999" },
  { label: "Under ₹1,999", query: "-1999" },
  { label: "₹2,000+", query: "2000-" },
] as const;

export function ShopByPrice() {
  return (
    <Section labelledBy="price-h" className="lg:pt-[72px]">
      <h2 id="price-h" className="t-h2 mb-3 lg:mb-4">
        Shop by price
      </h2>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-6">
        {PRICES.map((p) => (
          <li key={p.label}>
            <Link
              href={`/search?price=${p.query}`}
              className="flex h-28 flex-col justify-between rounded-2xl bg-surface p-4 text-foreground no-underline shadow-[inset_0_0_0_1.5px_var(--foreground)] lg:h-[132px] lg:rounded-[20px] lg:p-5"
            >
              <span className="self-start">
                <HangTag ink size="md">
                  {p.label}
                </HangTag>
              </span>
              <span className="t-small flex items-center justify-between font-bold">
                See pieces
                <ChevronRight aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Style tiles link to the normal search: a category where one fits, a text search otherwise. */
const STYLES = [
  { label: "Streetwear", href: "/search?q=streetwear", tint: "#E4E2DC", art: SILHOUETTE.tee },
  { label: "Y2K", href: "/search?q=y2k", tint: "#EAD9D6", art: SILHOUETTE.tee },
  { label: "Workwear", href: "/search?q=workwear", tint: "#E6E0D6", art: SILHOUETTE.jacket },
  { label: "Denim", href: "/search?q=denim", tint: "#DFE3E6", art: SILHOUETTE.pants },
  { label: "Vintage sports", href: "/search?q=vintage+sports", tint: "#DADFE8", art: SILHOUETTE.polo },
  { label: "Kurtas & ethnic", href: "/search?cat=kurtas", tint: "#E8E1D3", art: SILHOUETTE.kurta },
  { label: "Sneakers", href: "/search?cat=sneakers", tint: "#E9E8E4", art: SILHOUETTE.shoe },
  { label: "Bags", href: "/search?cat=bags", tint: "#E6DFD2", art: SILHOUETTE.bag },
] as const;

export function ShopByStyle() {
  return (
    <Section labelledBy="style-h" className="lg:pt-[72px]">
      <h2 id="style-h" className="t-h2 mb-3 lg:mb-4">
        Shop by style
      </h2>
      <Scroller desktopCols="lg:grid-cols-8 lg:!gap-4">
        {STYLES.map((s) => (
          <Link key={s.label} href={s.href} className="tile w-[148px] lg:w-auto" style={{ background: s.tint }}>
            <span className="img">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <path d={s.art} />
              </svg>
            </span>
            <span className="lbl !text-xs">{s.label}</span>
          </Link>
        ))}
      </Scroller>
    </Section>
  );
}

export function StoresToDiscover({ stores, followed, signedIn }: { stores: StoreCardData[]; followed: Set<string>; signedIn: boolean }) {
  if (stores.length === 0) return null;
  return (
    <Section id="stores" labelledBy="stores-h" className="lg:pt-[72px]">
      <SectionHead id="stores-h" title="Stores to discover" />
      <Scroller desktopCols="lg:grid-cols-3">
        {stores.map((s) => (
          <div key={s.id} className="w-[280px] lg:w-auto">
            <StoreCard store={s} following={followed.has(s.id)} signedIn={signedIn} />
          </div>
        ))}
      </Scroller>
    </Section>
  );
}

/** Just found a home: real recent sales, muted. Honest proof the marketplace is alive. */
export function JustFoundAHome({ items }: { items: CardItem[] }) {
  if (items.length === 0) return null;
  return (
    <Section labelledBy="home-h" className="lg:pt-[72px]">
      <SectionHead id="home-h" title="Just found a home" caption="Sold recently. Second lives, already started." />
      <Scroller desktopCols="lg:grid-cols-6 lg:!gap-5">
        {items.map((item, i) => (
          <div key={item.id} className={cx("w-[132px] lg:w-auto", i >= 6 && "lg:hidden")}>
            <ProductCard item={item} showSeller />
          </div>
        ))}
      </Scroller>
    </Section>
  );
}

const SELL_POINTS = ["No DM queue or payment screenshots", "Payments and tracking handled for you", "₹0 commission on buyers from your own link"];

/** For sellers band: dark and high contrast. */
export function SellerBand() {
  return (
    <section
      aria-labelledby="sell-h"
      className="band-dark relative -mx-4 mt-12 flex flex-col gap-[18px] overflow-hidden px-4 pb-10 pt-9 lg:mx-0 lg:mt-20 lg:grid lg:grid-cols-[1.3fr_1fr] lg:items-center lg:gap-10 lg:rounded-[28px] lg:p-12"
    >
      <div className="flex flex-col items-start gap-[18px]">
        <Sticker>For sellers</Sticker>
        <h2 id="sell-h" className="t-display text-white">
          Run a thrift page? Stop selling in DMs.
        </h2>
        <Link href="/sell" className={cx("btn h-14 px-6 text-base bg-white text-[#0D0D0C] shadow-[3px_3px_0_0_#C8B6FF]", "hidden lg:inline-flex")}>
          Bring your store
        </Link>
      </div>
      <ul className="flex flex-col gap-2.5 lg:gap-3.5">
        {SELL_POINTS.map((p) => (
          <li key={p} className="t-body flex lg:text-lg items-start gap-2.5 text-white lg:gap-3">
            <Check aria-hidden className="ic mt-px text-[#C8B6FF] lg:h-6 lg:w-6" strokeWidth={ICON_STROKE} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <Link href="/sell" className={"btn h-14 self-start bg-white px-6 text-base text-[#0D0D0C] shadow-[3px_3px_0_0_#C8B6FF] lg:hidden"}>
        Bring your store
      </Link>
    </section>
  );
}
