import Link from "next/link";
import { connection } from "next/server";
import { listSellersForAdmin } from "@yolt/core";
import { formatIndianMobile } from "@yolt/shared";
import { OnboardSellerForm, SellerStatusActions } from "@/components/admin/admin-actions";
import { db } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/session";

export default async function AdminSellers() {
  await connection();
  const { stale, role } = await requireAdmin();
  if (stale) return null;
  const rows = await listSellersForAdmin(db);

  return (
    <div className="space-y-6">
      {role === "ADMIN" && (
        <section className="space-y-2">
          <h2 className="font-semibold">Onboard an invited store</h2>
          <p className="text-xs text-muted">The owner signs in with this phone number. Nothing can be published until you mark KYC verified.</p>
          <OnboardSellerForm />
        </section>
      )}
      <section className="space-y-2">
        <h2 className="font-semibold">Stores ({rows.length})</h2>
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {rows.map(({ seller, phone, liveListings, openClaims }) => (
            <li key={seller.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <div>
                <Link href={`/s/${seller.handle}`} className="font-medium hover:underline">{seller.displayName}</Link>
                <span className="text-muted"> @{seller.handle}{phone && ` · ${formatIndianMobile(phone)}`}</span>
                <p className="text-xs text-muted">
                  {seller.status} · KYC {seller.kycStatus} · {liveListings} live · {openClaims} open claims
                </p>
              </div>
              {role === "ADMIN" && <SellerStatusActions sellerId={seller.id} status={seller.status} kycStatus={seller.kycStatus} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
