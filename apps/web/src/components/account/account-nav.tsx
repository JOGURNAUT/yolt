"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/cx";

const LINKS = [
  { href: "/account", label: "Profile" },
  { href: "/orders", label: "Orders" },
  { href: "/saved", label: "Saved" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/preferences", label: "My sizes" },
  { href: "/legal/buyer-protection", label: "Buyer protection" },
];

/** The desktop account sidebar. Phones use the profile list and the bottom nav instead. */
export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="hidden flex-col gap-0.5 lg:flex">
      {LINKS.map((l) => {
        const on = pathname === l.href;
        return (
          <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined} className={cx("flex min-h-11 items-center rounded-xl px-3 text-sm !no-underline", on ? "bg-accent font-bold text-on-accent" : "font-medium")} style={on ? undefined : { color: "inherit" }}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
