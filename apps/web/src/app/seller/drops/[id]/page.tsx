import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getSellerDrop, getSellerListing } from "@yolt/core";
import { DropBuilder } from "@/components/seller/drop-builder";
import { BackLink, PageHeader } from "@/components/seller/page-header";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { formatIST } from "@/lib/format";
import { db } from "@/lib/server/db";
import { requireSeller } from "@/lib/server/session";

export const metadata: Metadata = { title: "Drop", robots: { index: false } };

const STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  DRAFT: { tone: "neutral", label: "Draft" },
  SCHEDULED: { tone: "soon", label: "Scheduled" },
  LIVE: { tone: "available", label: "Live" },
  ENDED: { tone: "soldout", label: "Ended" },
  CANCELLED: { tone: "removed", label: "Cancelled" },
};

export default async function SellerDropPage({ params }: PageProps<"/seller/drops/[id]">) {
  await connection();
  const { id } = await params;
  const current = await requireSeller(`/seller/drops/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getSellerDrop(db, { sellerId: current.seller.id, dropId: id });
  if (!data) notFound();
  const { drop } = data;

  // What each unfinished piece still needs, from the same checklist as the editor.
  const withMissing = async <T extends { id: string; ready: boolean }>(rows: T[]) =>
    Promise.all(
      rows.map(async (r) => {
        if (r.ready) return { ...r, missing: null as string | null };
        const full = await getSellerListing(db, { sellerId: current.seller.id, listingId: r.id });
        const m = full?.readiness.missing ?? [];
        return { ...r, missing: m[0] ? (m.length > 1 ? `${m[0].message} (+${m.length - 1} more)` : m[0].message) : null };
      }),
    );
  const [items, eligible] = await Promise.all([withMissing(data.items), withMissing(data.eligible)]);
  const s = STATUS[drop.status] ?? { tone: "neutral" as const, label: drop.status };

  return (
    <>
      <BackLink href="/seller/drops">All drops</BackLink>
      <PageHeader
        size="h1"
        title={drop.status === "DRAFT" && drop.title === "" ? "New drop" : drop.title}
        kicker={`${formatIST(drop.startsAt)} · up to ${drop.maxHoldsPerBuyer} per buyer`}
        actions={<StatusBadge tone={s.tone}>{s.label}</StatusBadge>}
      />
      <DropBuilder
        dropId={drop.id}
        status={drop.status}
        items={items}
        eligible={eligible}
        kycVerified={current.seller.kycStatus === "VERIFIED"}
        preview={{ title: drop.title, when: formatIST(drop.startsAt), max: drop.maxHoldsPerBuyer, storeName: current.seller.displayName, sellerHandle: current.seller.handle }}
      />
    </>
  );
}
