"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Heart, House, Ticket, User } from "lucide-react";
import { ICON_STROKE } from "@/components/ui/cx";

const TABS = [
  { href: "/", label: "Home", icon: House, match: (p: string) => p === "/" },
  { href: "/search", label: "Explore", icon: Compass, match: (p: string) => p.startsWith("/search") },
  { href: "/drops", label: "Drops", icon: Ticket, match: (p: string) => p.startsWith("/drops") || p.startsWith("/d/") },
  { href: "/saved", label: "Saved", icon: Heart, match: (p: string) => p.startsWith("/saved") },
  // Profile points at orders until /account exists.
  { href: "/orders", label: "Profile", icon: User, match: (p: string) => p.startsWith("/orders") },
] as const;

const HIDDEN_ON = ["/seller", "/admin", "/checkout"];

/** BottomNav (board C3): buyer pages on phones. The active tab gets the accent bubble. */
export function BottomNav() {
  const pathname = usePathname();
  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return (
    <nav aria-label="Main" className="bnav fixed inset-x-0 bottom-0 z-30 h-[calc(68px+env(safe-area-inset-bottom,0px))] pb-[calc(8px+env(safe-area-inset-bottom,0px))] lg:hidden">
      {TABS.map(({ href, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={active ? "is-active" : undefined}>
            <span className="bub">
              <Icon aria-hidden className="ic ic-24" strokeWidth={ICON_STROKE} />
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
