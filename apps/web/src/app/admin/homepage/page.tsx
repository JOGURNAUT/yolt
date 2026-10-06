import type { Metadata } from "next";
import { connection } from "next/server";
import { LIVE_LISTING_STATUSES, listSlots } from "@yolt/core";
import { HomepageCurator, type PieceView, type SlotView } from "@/components/admin/homepage-curator";
import { PageHeader } from "@/components/seller/page-header";
import { getCurationCandidates, getPiecesByIds } from "@/lib/server/admin-queries";
import { db } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Homepage" };

export default async function AdminHomepage() {
  await connection();
  const { stale, role } = await requireAdmin();
  if (stale) return null;
  const [rows, { stores, pieces: live }] = await Promise.all([listSlots(db), getCurationCandidates()]);

  const slots: SlotView[] = rows.map(({ slot, sellerName, sellerHandle, state, winning }) => ({
    id: slot.id,
    kind: slot.kind,
    sellerId: slot.sellerId,
    sellerName,
    sellerHandle,
    title: slot.title,
    listingIds: slot.listingIds,
    startsAt: slot.startsAt?.toISOString() ?? null,
    endsAt: slot.endsAt?.toISOString() ?? null,
    createdAt: slot.createdAt.toISOString(),
    state,
    winning,
  }));

  // Pieces in a slot that the live list doesn't have: still shown, flagged as no longer live.
  const liveIds = new Set(live.map((p) => p.id));
  const missing = [...new Set(slots.flatMap((s) => s.listingIds))].filter((id) => !liveIds.has(id));
  const inSlots: PieceView[] = (await getPiecesByIds(missing)).map((p) => ({
    id: p.id,
    title: p.title ?? "Untitled",
    pricePaise: p.pricePaise,
    coverUrl: p.coverUrl,
    sellerName: p.sellerName,
    live: (LIVE_LISTING_STATUSES as readonly string[]).includes(p.status),
  }));
  const candidates: PieceView[] = live.map((p) => ({ id: p.id, title: p.title, pricePaise: p.pricePaise, coverUrl: p.coverUrl, sellerName: p.sellerName, live: true }));

  return (
    <>
      <PageHeader title="Homepage" kicker="Pick the featured store, the Grails list and the edit" size="h1" />
      <HomepageCurator canWrite={role === "ADMIN"} slots={slots} stores={stores} candidates={candidates} pieces={inSlots} />
    </>
  );
}
