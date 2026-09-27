import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getFollowedStores, getSavedListings } from "@yolt/core";
import { GuestSaved } from "@/components/guest-lists";
import { ProductGrid } from "@/components/product-card";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Saved", robots: { index: false } };

export default async function SavedPage() {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Saved</h1>
        <p className="text-sm text-muted">
          Saved on this device. <Link href="/login?next=/saved" className="underline">Sign in</Link> to keep them on every device.
        </p>
        <GuestSaved />
      </div>
    );
  }
  const [items, stores] = await Promise.all([getSavedListings(db, user.userId), getFollowedStores(db, user.userId)]);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h1 className="text-xl font-bold">Saved</h1>
        {items.length ? (
          <ProductGrid items={items} showSeller />
        ) : (
          <p className="py-6 text-sm text-muted">Tap ♡ on anything you like to keep it here.</p>
        )}
        {items.some((i) => i.status === "SOLD" || i.status === "SOLD_ELSEWHERE") && (
          <p className="text-xs text-muted">Sold pieces stay here so you can find similar ones: open one and tap “Find similar”.</p>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Stores you follow</h2>
        {stores.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {stores.map((s) => (
              <li key={s.handle}>
                <Link href={`/s/${s.handle}`} className="block rounded-lg border border-line bg-surface p-4 hover:border-foreground">
                  <p className="font-medium">{s.displayName}</p>
                  {s.bio && <p className="mt-1 line-clamp-2 text-sm text-muted">{s.bio}</p>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Follow stores to hear about their new pieces and drops.</p>
        )}
      </section>
    </div>
  );
}
