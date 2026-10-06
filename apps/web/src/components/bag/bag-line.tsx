import Link from "next/link";
import { Check, Clock, Info, X } from "lucide-react";
import { formatINR } from "@/lib/format";
import { BagRemoveButton } from "../bag-actions";
import { GarmentImage } from "../garment-image";
import { cx, ICON_STROKE } from "../ui/cx";
import { StatusBadge, type BadgeTone } from "../ui/status-badge";

export type BagLineItem = {
  id: string;
  slug: string;
  title: string;
  /** "W32 L32 · Good": size and condition, when known. */
  meta: string;
  pricePaise: number;
  status: string;
  buyable: boolean;
  category: string;
  coverUrl: string | null;
};

/** Why a piece can't be checked out, in the words the board uses (Bag, BagDesktop). */
function availability(item: Pick<BagLineItem, "status" | "buyable">): { tone: BadgeTone; label: string; icon: typeof Check; note?: string; similar: boolean } {
  if (item.buyable) return { tone: "available", label: "Available", icon: Check, similar: false };
  switch (item.status) {
    case "RESERVED":
    case "PAYMENT_PENDING":
      return {
        tone: "reserved",
        label: "Reserved right now",
        icon: Clock,
        note: "Someone else is paying for this. If they don't finish, it comes back.",
        similar: false,
      };
    case "SOLD":
    case "SOLD_ELSEWHERE":
      return { tone: "soldout", label: "Sold to another buyer", icon: X, similar: true };
    case "SCHEDULED":
      return { tone: "soon", label: "Coming soon", icon: Clock, note: "It isn't on sale yet.", similar: false };
    default:
      return { tone: "removed", label: "No longer available", icon: X, similar: true };
  }
}

/** One piece in the bag: photo, price, whether it can be bought now, and what to do if it can't. */
export function BagLine({ item }: { item: BagLineItem }) {
  const a = availability(item);
  const Icon = a.icon;
  const dimmed = !item.buyable && a.tone !== "reserved";
  return (
    <li className="flex gap-3 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <Link href={`/p/${item.slug}`} aria-label={item.title} tabIndex={-1} className={cx("block w-[76px] shrink-0 lg:w-20", dimmed && "opacity-45")}>
        <GarmentImage src={item.coverUrl} alt="" category={item.category} className="!rounded-md" />
      </Link>
      <div className="flex min-w-0 grow flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/p/${item.slug}`} className="t-h3 !text-[15px] !leading-5 no-underline hover:underline">
            {item.title}
          </Link>
          <span className={cx("t-h3 !text-[15px] !leading-5 whitespace-nowrap", !item.buyable && "text-muted")}>{formatINR(item.pricePaise)}</span>
        </div>
        {item.meta && <span className="t-small muted">{item.meta}</span>}
        <div>
          <StatusBadge tone={a.tone}>
            <Icon aria-hidden className="ic ic-14" strokeWidth={ICON_STROKE} />
            {a.label}
          </StatusBadge>
        </div>
        {a.note && <span className="help">{a.note}</span>}
        <div className="flex flex-wrap gap-x-4">
          <BagRemoveButton listingId={item.id} />
          {a.similar && (
            <Link href={`/search?cat=${encodeURIComponent(item.category)}`} className="btn btn-sm btn-ghost !h-11 !p-0">
              Find similar
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

/** The "bag isn't a reservation" note (board Bag): honest about one-of-one stock. */
export function BagNote() {
  return (
    <div role="note" className="flex items-start gap-2.5 rounded-md bg-surface-2 px-3.5 py-3">
      <Info aria-hidden className="ic -mt-px" strokeWidth={ICON_STROKE} />
      <span className="t-small font-semibold">Items in your bag aren&apos;t reserved. Unique pieces can sell.</span>
    </div>
  );
}

export function StoreInitials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#0d0d0c] text-white">
      <span className="wordmark text-[13px]">{initials}</span>
    </span>
  );
}
