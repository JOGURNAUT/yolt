import Link from "next/link";
import { requireSeller } from "@/lib/server/session";

export default async function SellerLayout({ children }: LayoutProps<"/seller">) {
  const current = await requireSeller("/seller/listings");
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Seller workspace</p>
          <p className="font-semibold">{current.seller.displayName}</p>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/seller/listings" className="hover:underline">
            Listings
          </Link>
          <Link href={`/s/${current.seller.handle}`} className="hover:underline">
            View store
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
