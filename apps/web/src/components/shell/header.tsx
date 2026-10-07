import Link from "next/link";
import { Heart } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { BagLink } from "@/components/shop-buttons";
import { ICON_STROKE } from "@/components/ui/cx";
import { IconLink } from "@/components/ui/icon-button";
import { SearchBar } from "@/components/ui/search-bar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NavLinks, type NavLink } from "./nav-links";

// "Stores" goes to the Explore page's stores list, which exists for guests and signed-in users alike.
export const NAV_LINKS: readonly NavLink[] = [
  { href: "/search", label: "Explore", match: ["/search", "/s"] },
  { href: "/drops", label: "Drops", match: ["/drops", "/d"], emphasis: true },
  { href: "/search#stores", label: "Stores" },
  { href: "/sell", label: "Sell on YOLT", match: ["/sell"] },
];

/**
 * Header (board C3). Mobile: wordmark, Sign in or account, bag, then the search row, which stays
 * stuck to the top as the first row scrolls away (sticky at minus the first row's 52 px).
 * Desktop: one row with the nav and the search inline.
 */
export function Header({
  phone,
  isSeller,
  isAdmin,
  devLogin,
}: {
  phone: string | null;
  isSeller: boolean;
  isAdmin: boolean;
  devLogin: boolean;
}) {
  return (
    <header className="sticky -top-[52px] z-30 border-b border-line bg-background/95 backdrop-blur lg:top-0">
      <div className="site-wrap grid grid-cols-[auto_1fr] items-center lg:h-[76px] lg:grid-cols-[auto_auto_minmax(0,1fr)_auto] lg:gap-x-5 xl:gap-x-7">
        <Link href="/" className="wordmark flex h-[52px] items-center text-2xl lg:h-auto lg:text-[30px]">
          YOLT
        </Link>
        <NavLinks links={NAV_LINKS} />
        <SearchBar className="col-span-2 row-start-2 mb-3 h-11 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:mb-0 lg:h-[46px] lg:w-full lg:max-w-[420px] lg:justify-self-end" />
        <div className="col-start-2 row-start-1 flex items-center justify-self-end gap-0.5 lg:col-start-4 lg:gap-2">
          {devLogin && (
            <Link href="/dev" className="mr-1 flex h-8 items-center whitespace-nowrap rounded-full border border-dashed border-muted px-3 text-xs text-muted lg:max-xl:hidden">
              Dev: switch user
            </Link>
          )}
          <IconLink href="/saved" label="Saved" plain className="hidden lg:inline-flex">
            <Heart aria-hidden className="ic ic-24" strokeWidth={ICON_STROKE} />
          </IconLink>
          <ThemeToggle />
          <AccountMenu phone={phone} isSeller={isSeller} isAdmin={isAdmin} />
          <BagLink />
        </div>
      </div>
    </header>
  );
}
