import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { formatIST, formatINR } from "@/lib/format";
import type { DropTicketData } from "@/lib/server/queries";
import { GarmentImage } from "@/components/garment-image";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { HangTag } from "@/components/ui/hang-tag";
import { Stamp } from "@/components/ui/stamp";
import { Sticker } from "@/components/ui/sticker";
import { DropCountdown, RemindButton } from "./drop-clock";

/** A piece as the slides need it: what a card has, minus the seller bits. */
export type SlidePiece = { id: string; slug: string; title: string; category: string; pricePaise: number; coverUrl: string | null };

/** The padding leaves room for the segments and pause button (phone, top) or the controls pill (desktop, bottom). */
const FRAME = "relative flex h-full flex-col overflow-hidden px-[18px] pb-[18px] pt-11 lg:px-7 lg:pb-16 lg:pt-[22px]";
/** White button with the accent shadow, for dark slides. */
const BTN = "h-11 px-4 text-sm lg:h-12 lg:px-5 lg:text-[15px]";
const BTN_ON_DARK = `btn ${BTN} bg-white !text-[#0D0D0C] shadow-[3px_3px_0_0_var(--accent)]`;
const BTN_PRIMARY = `btn btn-primary ${BTN}`;
const TITLE = "t-display !text-[26px] !leading-[26px] lg:!text-[44px] lg:!leading-[44px]";

/** Slide 1, always first: the brand line over a collage of the newest pieces. */
export function BrandSlide({ pieces }: { pieces: SlidePiece[] }) {
  const [a, b, c] = pieces;
  const tile = "absolute ring-[3px] ring-white";
  return (
    <div className={cx(FRAME, "bg-[#0D0D0C] text-white")}>
      <div className="flex min-h-0 flex-1 gap-3.5">
        <div className="stagger flex w-[56%] flex-col justify-end gap-2.5 lg:gap-3">
          <p className="t-display !text-[28px] !leading-[28px] text-white lg:!text-[46px] lg:!leading-[46px]">Thrift without the DMs.</p>
          <p className="t-small text-[#D9D8D2]">One-of-one pieces from India&apos;s best Instagram thrift stores. Measured, flaws shown, paid safely.</p>
          <span>
            <Link href="/search?sort=newest" className={BTN_ON_DARK}>
              Shop fresh finds
            </Link>
          </span>
        </div>
        <div className="relative flex-1" aria-hidden="true">
          {a && <GarmentImage priority src={a.coverUrl} alt={a.title} category={a.category} className={cx(tile, "right-[2%] top-0 w-[52%] rotate-6")} />}
          {b && <GarmentImage priority src={b.coverUrl} alt={b.title} category={b.category} className={cx(tile, "left-0 top-[14%] w-[50%] -rotate-[7deg]")} />}
          {c && <GarmentImage priority src={c.coverUrl} alt={c.title} category={c.category} className={cx(tile, "bottom-0 left-[26%] w-[46%] -rotate-2")} />}
          <span className="absolute bottom-[6%] right-0">
            <Sticker>1 of 1</Sticker>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Slide 2: the next live or upcoming drop. The store's name leads, the poster (or, without one, the
 * first pieces' photos with their prices) runs edge to edge on the right, and the countdown and the
 * reminder sit under the title. The ticket-stub perforation splits the words from the photos.
 */
export function DropSlide({ drop, serverNow, signedIn, reminderOn, holdMinutes }: { drop: DropTicketData; serverNow: string; signedIn: boolean; reminderOn: boolean; holdMinutes: number }) {
  const when = formatIST(drop.startsAt);
  const initials = drop.sellerName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="relative flex h-full overflow-hidden bg-[#0D0D0C] text-white">
      <div className="stagger relative z-[1] flex w-[66%] flex-col justify-between gap-2.5 px-[18px] pb-[18px] pt-10 lg:w-[52%] lg:px-7 lg:pb-16 lg:pt-[22px]">
        <div className="flex flex-col items-start gap-2 lg:gap-2.5">
          {drop.live ? (
            <Stamp dot wobble>
              Live now
            </Stamp>
          ) : (
            <Sticker tone="paper">Upcoming drop</Sticker>
          )}
          <Link href={`/s/${drop.sellerHandle}`} className="flex items-center gap-2 !text-white !no-underline hover:!underline">
            <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center bg-white text-[11px] font-bold text-[#0D0D0C]">
              {initials}
            </span>
            <span className="t-caption !text-[12px] uppercase !tracking-[0.12em] lg:!text-[13px]">{drop.sellerName}</span>
          </Link>
          <p className={"t-display text-white !text-[20px] !leading-[20px] lg:!text-[44px] lg:!leading-[44px]"}>{drop.title}</p>
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="t-mono border border-white/50 px-1.5 py-0.5 !text-[10px] lg:px-2 lg:py-1 lg:!text-xs">{when}</span>
            <span className="t-mono border border-white/50 px-1.5 py-0.5 !text-[10px] lg:px-2 lg:py-1 lg:!text-xs">
              {drop.pieces} {drop.pieces === 1 ? "piece" : "pieces"}
            </span>
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 lg:gap-2.5">
          <div className="flex flex-col items-start gap-2.5 lg:flex-row lg:items-center">
            {!drop.live && <DropCountdown startsAt={drop.startsAt.toISOString()} serverNow={serverNow} className="[&_.cell]:!bg-white [&_.cell]:!text-[#0D0D0C]" />}
            <span>
              {drop.live ? (
                <Link href={`/d/${drop.id}`} className={BTN_ON_DARK}>
                  Claim now
                </Link>
              ) : (
                <RemindButton dropId={drop.id} title={drop.title} startsAt={drop.startsAt.toISOString()} reminderOn={reminderOn} signedIn={signedIn} className={BTN_ON_DARK} />
              )}
            </span>
          </div>
          <p className="t-small hidden !text-[12px] text-[#D9D8D2] lg:block">
            First to claim gets {holdMinutes} minutes to pay · max {drop.maxHoldsPerBuyer} per person
          </p>
        </div>
      </div>

      {/* the ticket-stub motif: a perforation with two square notches, between the words and the photos */}
      <div aria-hidden="true" className="absolute inset-y-0 left-[66%] z-[2] border-l-2 border-dashed border-white/45 lg:left-[52%]" />
      <span aria-hidden="true" className="absolute -top-[9px] left-[calc(66%-9px)] z-[2] h-[18px] w-[18px] bg-background lg:left-[calc(52%-9px)]" />
      <span aria-hidden="true" className="absolute -bottom-[9px] left-[calc(66%-9px)] z-[2] h-[18px] w-[18px] bg-background lg:left-[calc(52%-9px)]" />

      <div aria-hidden="true" className="absolute inset-y-0 right-0 w-[34%] lg:w-[48%]">
        {drop.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- switch to next/image once the media loader exists
          <img src={drop.coverUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="grid size-full grid-rows-3 gap-px bg-white/20 lg:grid-cols-3 lg:grid-rows-1">
            {drop.thumbs.map((t, i) => (
              <div key={i} className="relative min-h-0 overflow-hidden">
                <GarmentImage src={t.coverUrl} alt={t.title} category={t.category} className="!aspect-auto !h-full !w-full !rounded-none" />
                {t.pricePaise !== null && (
                  <span className="absolute bottom-2 left-1.5 hidden lg:block">
                    <HangTag>{formatINR(t.pricePaise)}</HangTag>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type SlideStore = { handle: string; displayName: string; bio: string | null; logoUrl: string | null; bannerUrl: string | null };
type StoreFacts = { city: string | null; instagramVerified: boolean; rating: number | null; reviewCount: number };

/** Slide 3: the featured store, over its cover. */
export function StoreSlide({ store, facts }: { store: SlideStore; facts: StoreFacts | null }) {
  const initials = store.displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  return (
    <div className={cx(FRAME, "bg-[#2A2926] text-[#0D0D0C]")}>
      {store.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- the store's own cover, decorative
        <img src={store.bannerUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {/* a soft scrim keeps the white segments and controls readable on any cover */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 to-transparent" />
      <div className="relative flex min-h-0 flex-1 flex-col items-start justify-between">
        <Sticker>Store spotlight</Sticker>
        <div className="stagger flex max-w-none flex-col gap-2 self-stretch bg-white p-3 px-3.5 lg:max-w-[520px] lg:px-5 lg:py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0D0D0C] text-white">
              {store.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- the store's own logo
                <img src={store.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="wordmark text-sm">{initials}</span>
              )}
            </span>
            <p className="t-h2 !text-base !leading-[18px] lg:!text-[22px] lg:!leading-[26px]">
              {store.displayName}
              {facts?.city ? ` · ${facts.city}` : ""}
            </p>
          </div>
          {store.bio && <p className="t-small line-clamp-2 text-[#5B5A55]">{store.bio}</p>}
          <div className="flex items-center justify-between gap-2.5">
            <span className="t-small flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-bold">
              {facts?.instagramVerified && (
                <span className="inline-flex items-center gap-1">
                  <BadgeCheck aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />
                  Instagram verified
                </span>
              )}
              {facts && facts.rating !== null ? (
                <span>
                  ★ {facts.rating.toFixed(1)} <span className="font-medium text-[#5B5A55]">({facts.reviewCount})</span>
                </span>
              ) : (
                <span className="font-medium text-[#5B5A55]">New on YOLT · no reviews yet</span>
              )}
            </span>
            <Link href={`/s/${store.handle}`} className={cx(BTN_PRIMARY, "shrink-0")}>
              Visit store
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Slide 4: the current edit, three real pieces. The button jumps to the full edit further down. */
export function EditSlide({ title, pieces }: { title: string; pieces: SlidePiece[] }) {
  return (
    <div className={cx(FRAME, "bg-[#F0EFEA] text-[#0D0D0C]")}>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5">
        <div className="stagger flex flex-col gap-1">
          <span className="t-caption text-[#5B5A55]">The edit · picked by YOLT</span>
          <p className="t-display !text-2xl !leading-6 lg:!text-[44px] lg:!leading-[44px]">{title}</p>
        </div>
        <div className="mt-auto flex items-end gap-2.5">
          {pieces.slice(0, 3).map((p) => (
            <Link key={p.id} href={`/p/${p.slug}`} aria-label={`${p.title}, ${formatINR(p.pricePaise)}`} className="relative w-24 shrink-0 lg:w-[120px]">
              <GarmentImage src={p.coverUrl} alt={p.title} category={p.category} className="!rounded-none" />
              <span className="tagpos absolute left-1.5 top-2">
                <span className="[&_.hangtag]:h-[22px] [&_.hangtag]:pl-[17px] [&_.hangtag]:pr-2 [&_.hangtag]:text-[11px]">
                  <HangTag>{formatINR(p.pricePaise)}</HangTag>
                </span>
              </span>
            </Link>
          ))}
          <a href="#edit" className={cx(BTN_PRIMARY, "ml-3 hidden lg:inline-flex")}>
            Shop the edit
          </a>
        </div>
        <span className="lg:hidden">
          <a href="#edit" className={BTN_PRIMARY}>
            Shop the edit
          </a>
        </span>
      </div>
    </div>
  );
}

/** Slide 5: the fit promise, a tape-measure motif. */
export function FitSlide() {
  const ticks = Array.from({ length: 36 }, (_, i) => String(i * 5));
  return (
    <div className={cx(FRAME, "bg-white text-[#0D0D0C]")}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <p className="t-display !text-[26px] !leading-[26px] lg:!text-[46px] lg:!leading-[46px]">Measured, not guessed.</p>
        <div aria-hidden="true" className="tape tape-bleed shrink-0">
          <div className="nums">
            {ticks.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-end gap-3.5">
          <div className="stagger flex flex-1 flex-col items-start gap-2.5">
            <p className="t-small text-[#5B5A55]">Every piece is measured flat, so you can lay it next to something you already own. Pick your size once and see what fits.</p>
            <a href="#shop-your-size" className={BTN_PRIMARY}>
              Shop your size
            </a>
          </div>
          <svg viewBox="0 0 120 120" aria-hidden="true" className="h-24 w-24 shrink-0 fill-none stroke-[#0D0D0C] lg:h-[100px] lg:w-[100px]" strokeLinejoin="round" strokeLinecap="round">
            <path d="M34 12 L78 12 L82 110 L64 110 L56 50 L48 110 L30 110 Z M34 20 L78 20" strokeOpacity=".45" strokeWidth="1.6" />
            <path d="M34 6 L78 6 M34 2 L34 10 M78 2 L78 10 M96 12 L96 110 M92 12 L100 12 M92 110 L100 110" strokeWidth="1.6" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/** The seller slide: optional sixth, or in place of the edit when none is running. */
export function SellerSlide() {
  return (
    <div className={cx(FRAME, "bg-[#0D0D0C] text-white")}>
      <div className="flex min-h-0 flex-1 flex-col justify-between gap-2.5">
        <span className="self-start">
          <Sticker>₹0 commission on your own buyers</Sticker>
        </span>
        <div className="stagger flex flex-col gap-2.5 lg:gap-3">
          <p className="t-display !text-2xl !leading-6 text-white lg:!text-[38px] lg:!leading-[38px]">Run a thrift page? Stop selling in DMs.</p>
          <p className="t-small max-w-[520px] text-[#D9D8D2]">No BOOK comments, no payment screenshots. Give your pieces their second life on a real shop.</p>
          <span>
            <Link href="/sell" className={BTN_ON_DARK}>
              Bring your store
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}
