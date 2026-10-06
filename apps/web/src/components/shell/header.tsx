import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import { BagLink } from "@/components/shop-buttons";
import { SearchBar } from "@/components/ui/search-bar";

export const NAV_LINKS = [
  { href: "/search", label: "Explore" },
  { href: "/drops", label: "Drops" },
  { href: "/#stores", label: "Stores" },
  { href: "/sell", label: "Sell on YOLT" },
] as const;

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
      <div className="mx-auto grid max-w-[1248px] grid-cols-[auto_1fr] items-center px-4 lg:h-[76px] lg:grid-cols-[auto_auto_1fr_auto] lg:gap-x-7 lg:px-6">
        <Link href="/" className="wordmark flex h-[52px] items-center text-2xl lg:h-auto lg:text-[30px]">
          YOLT
        </Link>
        <nav aria-label="Main" className="hidden gap-6 text-[15px] font-bold lg:flex">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
        <SearchBar className="col-span-2 row-start-2 mb-3 h-11 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:mb-0 lg:h-[46px] lg:w-[420px] lg:justify-self-end" />
        <div className="col-start-2 row-start-1 flex items-center justify-self-end gap-0.5 lg:col-start-4 lg:gap-2">
          {devLogin && (
            <Link href="/dev" className="mr-1 flex h-8 items-center rounded-full border border-dashed border-muted px-3 text-xs text-muted">
              Dev: switch user
            </Link>
          )}
          <AccountMenu phone={phone} isSeller={isSeller} isAdmin={isAdmin} />
          <BagLink />
        </div>
      </div>
    </header>
  );
}
