import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSeller } from "@/lib/server/session";

export const metadata: Metadata = { title: "Sell on YOLT" };

export default async function SellPage() {
  if (await getCurrentSeller()) redirect("/seller/listings");
  return (
    <div className="mx-auto max-w-lg space-y-4 pt-6">
      <h1 className="text-2xl font-bold">Sell on YOLT</h1>
      <p>
        YOLT is invite-only while we pilot with a small group of thrift stores. Selling is free: no commission on sales to
        your own followers.
      </p>
      <p className="text-sm text-muted">
        Seller applications (Instagram check, PAN and bank verification) are coming next. Until then, reach out and
        we&apos;ll set up your store with you.
      </p>
      <Link href="/" className="inline-block rounded-full border border-line px-4 py-2 text-sm">
        Back to shopping
      </Link>
    </div>
  );
}
