"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, Star, Store, Tag, Ticket, Wallet, type LucideIcon } from "lucide-react";
import { Sticker } from "@/components/ui/sticker";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { initials } from "@/lib/store-format";

const ITEMS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/seller", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/seller/listings", label: "Listings", icon: Tag },
  { href: "/seller/drops", label: "Drops", icon: Ticket },
  { href: "/seller/orders", label: "Orders", icon: Package },
  { href: "/seller/reviews", label: "Reviews", icon: Star },
  { href: "/seller/payouts", label: "Payouts", icon: Wallet },
  { href: "/seller/store", label: "Store settings", icon: Store },
];

/**
 * SellerNav (board C6): a sidebar on desktop, scrolling tabs on phones. The orders count is the
 * number waiting to be packed.
 */
export function SellerNav({ store, toShip }: { store: { name: string; handle: string; logoUrl: string | null }; toShip: number }) {
  const pathname = usePathname();
  const active = (i: (typeof ITEMS)[number]) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`));
  const count = (href: string) =>
    href === "/seller/orders" && toShip > 0 ? (
      <span className="badge neutral !h-5 !px-[7px]">
        {toShip}
        <span className="sr-only"> to pack</span>
      </span>
    ) : null;

  return (
    <>
      <aside className="sticky top-24 hidden self-start lg:flex lg:flex-col lg:gap-5">
        <div className="flex items-center gap-2">
          <span className="t-h3">Workspace</span>
          <Sticker tone="ink" className="!h-[22px] !text-[10px]">
            Seller
          </Sticker>
        </div>
        <Link href={`/s/${store.handle}`} className="flex items-center gap-2.5 rounded-[14px] bg-surface-2 p-2.5 !no-underline" style={{ color: "inherit" }}>
          <StoreMark store={store} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="t-small truncate font-bold">{store.name}</span>
            <span className="t-caption muted truncate !font-medium">View your store</span>
          </span>
        </Link>
        <nav aria-label="Seller" className="flex flex-col gap-0.5">
          {ITEMS.map((i) => (
            <Link key={i.href} href={i.href} className="snav-link !no-underline" aria-current={active(i) ? "page" : undefined}>
              <i.icon aria-hidden className="ic" strokeWidth={ICON_STROKE} />
              <span className="grow">{i.label}</span>
              {count(i.href)}
            </Link>
          ))}
        </nav>
        <Link href="/" className="btn btn-sm btn-ghost !h-11 self-start !px-0">
          Switch to shopping
        </Link>
      </aside>

      <nav aria-label="Seller sections" className="hscroll-bleed flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden [scrollbar-width:none]">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} aria-current={active(i) ? "page" : undefined} className={cx("pill !no-underline", active(i) && "is-active")}>
            {i.label}
            {count(i.href)}
          </Link>
        ))}
        <Link href="/" className="pill !no-underline !shadow-none">
          Switch to shopping
        </Link>
      </nav>
    </>
  );
}

export function StoreMark({ store, size = 36 }: { store: { name: string; logoUrl: string | null }; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0d0d0c] text-white" style={{ width: size, height: size }}>
      {store.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- seller's uploaded logo
        <img src={store.logoUrl} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden="true" className="wordmark" style={{ fontSize: size / 3 }}>
          {initials(store.name)}
        </span>
      )}
    </span>
  );
}
