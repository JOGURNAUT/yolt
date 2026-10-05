import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { listSellerDrops } from "@yolt/core";
import { NewDropForm } from "@/components/seller/drop-builder";
import { formatIST } from "@/lib/format";
import { db } from "@/lib/server/db";
import { requireSeller } from "@/lib/server/session";

export const metadata: Metadata = { title: "Drops", robots: { index: false } };

const LABEL: Record<string, string> = { DRAFT: "Draft", SCHEDULED: "Scheduled", LIVE: "Live", ENDED: "Ended", CANCELLED: "Cancelled" };

export default async function SellerDropsPage() {
  await connection();
  const current = await requireSeller("/seller/drops");
  const rows = await listSellerDrops(db, current.seller.id);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Drops</h1>
      <section className="space-y-2">
        <h2 className="font-semibold">New drop</h2>
        <p className="text-xs text-muted">Announce it on Instagram with the drop link. Items are locked as Coming soon until it opens.</p>
        <NewDropForm />
      </section>
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
        {rows.length === 0 && <li className="p-3 text-muted">No drops yet.</li>}
        {rows.map(({ drop, items, reminders }) => (
          <li key={drop.id}>
            <Link href={`/seller/drops/${drop.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-background">
              <span>
                <span className="font-medium">{drop.title}</span>
                <span className="block text-muted">
                  {formatIST(drop.startsAt)} · {items} pieces · {reminders} reminders
                </span>
              </span>
              <span className="text-xs">{LABEL[drop.status]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
