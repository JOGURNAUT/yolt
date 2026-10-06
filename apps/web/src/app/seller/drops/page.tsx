import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronRight, Ticket } from "lucide-react";
import { listSellerDrops } from "@yolt/core";
import { NewDropForm } from "@/components/seller/drop-builder";
import { PageHeader } from "@/components/seller/page-header";
import { ICON_STROKE } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { formatIST } from "@/lib/format";
import { db } from "@/lib/server/db";
import { requireSeller } from "@/lib/server/session";

export const metadata: Metadata = { title: "Drops", robots: { index: false } };

const STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  DRAFT: { tone: "neutral", label: "Draft" },
  SCHEDULED: { tone: "soon", label: "Scheduled" },
  LIVE: { tone: "available", label: "Live" },
  ENDED: { tone: "soldout", label: "Ended" },
  CANCELLED: { tone: "removed", label: "Cancelled" },
};

export default async function SellerDropsPage() {
  await connection();
  const current = await requireSeller("/seller/drops");
  const rows = await listSellerDrops(db, current.seller.id);

  return (
    <>
      <PageHeader title="Drops" kicker="Schedule a drop, and followers get reminded." />

      <section aria-labelledby="new-drop-h" className="space-y-2">
        <h2 id="new-drop-h" className="t-h2">
          New drop
        </h2>
        <NewDropForm />
      </section>

      <section aria-labelledby="all-drops-h" className="space-y-2">
        <h2 id="all-drops-h" className="t-h2">
          Your drops
        </h2>
        {rows.length === 0 ? (
          <EmptyState tag="DROP" title="No drops yet">
            Create one above. Pieces in a drop show as Coming soon until it opens.
          </EmptyState>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {rows.map(({ drop, items, reminders }) => {
              const s = STATUS[drop.status] ?? { tone: "neutral" as const, label: drop.status };
              return (
                <li key={drop.id}>
                  <Link href={`/seller/drops/${drop.id}`} className="flex min-h-[72px] items-center gap-3 p-3.5 !no-underline" style={{ color: "inherit" }}>
                    <Ticket aria-hidden className="ic shrink-0" strokeWidth={ICON_STROKE} />
                    <span className="flex min-w-0 grow flex-col gap-1">
                      <span className="t-small font-bold">{drop.title}</span>
                      <span className="t-small muted">
                        {formatIST(drop.startsAt)} · {items} {items === 1 ? "piece" : "pieces"} · {reminders} {reminders === 1 ? "reminder" : "reminders"}
                      </span>
                    </span>
                    <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                    <ChevronRight aria-hidden className="ic ic-16 shrink-0" strokeWidth={ICON_STROKE} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
