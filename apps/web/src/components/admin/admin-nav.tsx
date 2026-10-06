"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, LayoutDashboard, LayoutTemplate, ScrollText, ShieldAlert, Store, type LucideIcon } from "lucide-react";
import { Sticker } from "@/components/ui/sticker";
import { cx, ICON_STROKE } from "@/components/ui/cx";

export type AdminNavCounts = { sellers: number; reports: number; refunds: number };

const ITEMS: { href: string; label: string; icon: LucideIcon; exact?: boolean; count?: keyof AdminNavCounts; noun?: string }[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/sellers", label: "Sellers", icon: Store, count: "sellers", noun: "new applications" },
  { href: "/admin/claims", label: "Reports", icon: ShieldAlert, count: "reports", noun: "to decide" },
  { href: "/admin/refunds", label: "Refunds", icon: Banknote, count: "refunds", noun: "to issue" },
  { href: "/admin/homepage", label: "Homepage", icon: LayoutTemplate },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
];

/**
 * AdminNav (board C3): a sidebar on desktop, scrolling tabs on phones. The badges are work waiting
 * for a person: new applications, reports to decide, refunds to issue.
 */
export function AdminNav({ role, counts }: { role: string; counts: AdminNavCounts }) {
  const pathname = usePathname();
  const active = (i: (typeof ITEMS)[number]) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`));
  const badge = (i: (typeof ITEMS)[number]) => {
    const n = i.count ? counts[i.count] : 0;
    return n > 0 ? (
      <span className="badge neutral !h-5 !px-[7px]">
        {n}
        <span className="sr-only"> {i.noun}</span>
      </span>
    ) : null;
  };

  return (
    <>
      <aside className="sticky top-24 hidden self-start lg:flex lg:flex-col lg:gap-5">
        <div className="flex items-center gap-2">
          <span className="t-h3">Admin</span>
          <Sticker tone="ink" className="!h-[22px] !text-[10px]">
            {role}
          </Sticker>
        </div>
        <nav aria-label="Admin" className="flex flex-col gap-0.5">
          {ITEMS.map((i) => (
            <Link key={i.href} href={i.href} className="snav-link !no-underline" aria-current={active(i) ? "page" : undefined}>
              <i.icon aria-hidden className="ic" strokeWidth={ICON_STROKE} />
              <span className="grow">{i.label}</span>
              {badge(i)}
            </Link>
          ))}
        </nav>
        <p className="t-small muted rounded-[14px] bg-surface-2 p-3">Signed in as staff · every action needs a reason</p>
      </aside>

      <div className="flex flex-col gap-2 lg:hidden">
        <nav aria-label="Admin sections" className="hscroll-bleed flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {ITEMS.map((i) => (
            <Link key={i.href} href={i.href} aria-current={active(i) ? "page" : undefined} className={cx("pill !no-underline", active(i) && "is-active")}>
              {i.label}
              {badge(i)}
            </Link>
          ))}
        </nav>
        <p className="t-caption muted">
          Signed in as staff ({role}) · every action needs a reason
        </p>
      </div>
    </>
  );
}
