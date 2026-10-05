import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getSellerDrop } from "@yolt/core";
import { DropBuilder } from "@/components/seller/drop-builder";
import { ShareLinkButton } from "@/components/seller/share-link-button";
import { formatIST } from "@/lib/format";
import { db } from "@/lib/server/db";
import { requireSeller } from "@/lib/server/session";

export const metadata: Metadata = { title: "Drop", robots: { index: false } };

export default async function SellerDropPage({ params }: PageProps<"/seller/drops/[id]">) {
  await connection();
  const { id } = await params;
  const current = await requireSeller(`/seller/drops/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getSellerDrop(db, { sellerId: current.seller.id, dropId: id });
  if (!data) notFound();
  const { drop } = data;

  return (
    <div className="space-y-5">
      <Link href="/seller/drops" className="text-sm text-muted hover:underline">← All drops</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{drop.title}</h1>
          <p className="text-sm text-muted">{formatIST(drop.startsAt)} · hold limit {drop.maxHoldsPerBuyer} per buyer · {drop.status.toLowerCase()}</p>
        </div>
        {drop.status !== "DRAFT" && drop.status !== "CANCELLED" && (
          <div className="flex gap-2">
            <Link href={`/d/${drop.id}`} className="rounded-full border border-line px-3 py-1.5 text-sm">View drop page</Link>
            <ShareLinkButton path={`/d/${drop.id}`} sellerHandle={current.seller.handle} label="Copy drop link" />
          </div>
        )}
      </header>
      <DropBuilder dropId={drop.id} status={drop.status} items={data.items} eligible={data.eligible} kycVerified={current.seller.kycStatus === "VERIFIED"} />
    </div>
  );
}
