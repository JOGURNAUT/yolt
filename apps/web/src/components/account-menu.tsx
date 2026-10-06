"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { User } from "lucide-react";
import { ButtonLink } from "./ui/button";
import { ICON_STROKE } from "./ui/cx";

export function AccountMenu({ phone, isSeller, isAdmin }: { phone: string | null; isSeller: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  // Open for the page it was opened on, so navigating anywhere closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        buttonRef.current?.focus(); // hand focus back to the button that opened the menu
        setOpenOn(null);
      } else if (!ref.current?.contains(e.target as Node)) {
        setOpenOn(null);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!phone) {
    return (
      <ButtonLink href={`/login?next=${encodeURIComponent(pathname)}`} variant="ghost" size="sm" className="h-11 px-2">
        Sign in
      </ButtonLink>
    );
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setOpenOn(null);
    router.refresh();
  }

  const item = "flex min-h-11 items-center rounded-md px-3 text-sm font-semibold hover:bg-surface-2";
  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Account"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpenOn(open ? null : pathname)}
        className="iconbtn is-plain"
      >
        <User aria-hidden className="ic ic-24" strokeWidth={ICON_STROKE} />
      </button>
      <div id={panelId} hidden={!open} className="card overlay absolute right-0 top-full z-40 mt-1 w-60 p-1.5">
        <p className="t-small muted px-3 pb-1 pt-2">{phone}</p>
        <Link href="/account" className={item}>
          Profile
        </Link>
        <Link href="/orders" className={item}>
          Orders
        </Link>
        <Link href="/saved" className={item}>
          Saved
        </Link>
        <Link href={isSeller ? "/seller" : "/sell"} className={item}>
          {isSeller ? "Seller workspace" : "Sell on YOLT"}
        </Link>
        {isAdmin && (
          <Link href="/admin" className={item}>
            Admin
          </Link>
        )}
        <div className="divider my-1" />
        <button type="button" onClick={signOut} className={`${item} w-full text-left text-muted`}>
          Sign out
        </button>
      </div>
    </div>
  );
}
