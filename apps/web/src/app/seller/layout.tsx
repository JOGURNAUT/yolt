import { getSellerOrderCounts } from "@yolt/core";
import { SellerNav } from "@/components/seller/seller-nav";
import { db } from "@/lib/server/db";
import { requireSeller } from "@/lib/server/session";
import "@/styles/seller.css";

export default async function SellerLayout({ children }: LayoutProps<"/seller">) {
  const current = await requireSeller("/seller");
  const counts = await getSellerOrderCounts(db, current.seller.id);
  const { displayName, handle, logoUrl } = current.seller;
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-8">
      <SellerNav store={{ name: displayName, handle, logoUrl }} toShip={counts["to-ship"]} />
      <div className="min-w-0 space-y-5">{children}</div>
    </div>
  );
}
