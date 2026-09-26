"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function AccountMenu({ phone, isSeller }: { phone: string | null; isSeller: boolean }) {
  const router = useRouter();
  const pathname = usePathname();

  if (!phone) {
    return (
      <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="rounded-full border border-line px-3 py-1 text-sm">
        Sign in
      </Link>
    );
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <Link href="/orders" className="hover:underline">
        Orders
      </Link>
      <Link href={isSeller ? "/seller/orders" : "/sell"} className="hover:underline">
        {isSeller ? "Your store" : "Sell"}
      </Link>
      <span className="hidden text-muted sm:inline">{phone}</span>
      <button type="button" onClick={signOut} className="text-muted hover:underline">
        Sign out
      </button>
    </div>
  );
}
