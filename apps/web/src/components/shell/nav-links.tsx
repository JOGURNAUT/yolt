"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/cx";

export type NavLink = { href: string; label: string; /** Path prefixes that make this link the current page. */ match?: readonly string[] };

/** Desktop header links. The current page gets an accent underline and `aria-current="page"`. */
export function NavLinks({ links }: { links: readonly NavLink[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-5 whitespace-nowrap text-[15px] font-bold lg:flex xl:gap-6">
      {links.map((l) => {
        const current = (l.match ?? []).some((m) => pathname === m || pathname.startsWith(`${m}/`));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={current ? "page" : undefined}
            className={cx("flex h-11 items-center hover:underline", current && "underline decoration-accent decoration-2 underline-offset-8")}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
