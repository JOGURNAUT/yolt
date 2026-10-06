"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Search } from "lucide-react";
import { GarmentImage } from "@/components/garment-image";
import { Button, ButtonLink } from "@/components/ui/button";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { Toast } from "@/components/ui/toast";
import { formatINR } from "@/lib/format";
import { ListingStatusActions, runListingAction } from "./listing-actions";
import { ConfirmDialog } from "./seller-dialog";

export type ListingRowData = {
  id: string;
  title: string | null;
  slug: string;
  status: string;
  category: string | null;
  tagSize: string | null;
  pricePaise: number | null;
  coverUrl: string | null;
  updated: string;
};

const BADGE: Record<string, { tone: BadgeTone; label: string; note?: string }> = {
  DRAFT: { tone: "neutral", label: "Draft", note: "Not published yet" },
  AVAILABLE: { tone: "available", label: "Live" },
  RESERVED: { tone: "reserved", label: "Reserved", note: "A buyer is paying · locked" },
  PAYMENT_PENDING: { tone: "reserved", label: "Reserved", note: "A buyer is paying · locked" },
  SCHEDULED: { tone: "soon", label: "Scheduled", note: "In a drop · locked until it opens" },
  SOLD: { tone: "soldout", label: "Sold" },
  SOLD_ELSEWHERE: { tone: "soldout", label: "Sold", note: "Sold elsewhere" },
  WITHDRAWN: { tone: "removed", label: "Withdrawn", note: "Off sale. Edit to relist." },
};

const EDITABLE = ["DRAFT", "AVAILABLE", "WITHDRAWN"];
const LOCKED = ["RESERVED", "PAYMENT_PENDING", "SCHEDULED"];

type Bulk = "sold-elsewhere" | "withdraw";

/**
 * ListingRow list (boards Listings, ListingsMobile, ListingsSelecting). Live rows can be selected for
 * Mark sold elsewhere or Withdraw in bulk; reserved, scheduled and sold rows are locked.
 */
export function ListingsTable({ rows, selectable }: { rows: ListingRowData[]; selectable: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState<Bulk | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const shown = useMemo(() => rows.filter((r) => (r.title ?? "Untitled draft").toLowerCase().includes(query.trim().toLowerCase())), [rows, query]);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function runBulk() {
    if (!bulk) return;
    setBusy(true);
    setError(null);
    const failed: string[] = [];
    const failedIds: string[] = [];
    let ok = 0;
    for (const id of selected) {
      const r = await runListingAction(id, bulk);
      if (r.ok) ok += 1;
      else {
        failedIds.push(id);
        failed.push(`${rows.find((x) => x.id === id)?.title ?? "A piece"}: ${r.message}`);
      }
    }
    setBusy(false);
    router.refresh();
    setSelected(failedIds);
    if (failed.length === 0) {
      setBulk(null);
      setNotice(`${ok} ${ok === 1 ? "piece" : "pieces"} ${bulk === "withdraw" ? "withdrawn" : "marked sold elsewhere"}.`);
    } else {
      setError(`${ok} done. ${failed.join(" ")}`);
    }
  }

  return (
    <div className="space-y-3">
      <label className="search w-full sm:w-[320px]">
        <Search aria-hidden className="ic" strokeWidth={ICON_STROKE} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search your listings" placeholder="Search your listings" />
      </label>

      {notice && (
        <Toast tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Toast>
      )}

      {selectable && (
        <div
          role="region"
          aria-label="Bulk actions"
          className={cx("flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 rounded-none px-4 py-2", selected.length > 0 ? "bg-[#0d0d0c] text-white" : "bg-surface-2")}
        >
          {selected.length > 0 ? (
            <>
              <span aria-live="polite" className="t-small grow font-bold">
                {selected.length} {selected.length === 1 ? "item" : "items"} selected
              </span>
              <Button size="sm" className="!h-11 !bg-white !text-[#0d0d0c] !shadow-none" onClick={() => setBulk("sold-elsewhere")}>
                Mark sold elsewhere
              </Button>
              <Button size="sm" variant="secondary" className="!h-11 !bg-transparent !text-white !shadow-[inset_0_0_0_2px_#fff]" onClick={() => setBulk("withdraw")}>
                Withdraw
              </Button>
              <Button size="sm" variant="ghost" className="!h-11 !text-white" onClick={() => setSelected([])}>
                Clear
              </Button>
            </>
          ) : (
            <span className="t-small muted">Select live pieces for bulk actions. Reserved and sold pieces are locked.</span>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="t-small muted py-8 text-center">{query ? `No listing matches “${query}”.` : "Nothing here."}</p>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {shown.map((l) => {
            const b = BADGE[l.status] ?? { tone: "neutral" as const, label: l.status };
            const title = l.title ?? "Untitled draft";
            const editable = EDITABLE.includes(l.status);
            const locked = LOCKED.includes(l.status);
            const on = selected.includes(l.id);
            return (
              <li key={l.id} className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 p-3", on && "bg-accent/20")}>
                {selectable && (
                  <label className="rowcheck">
                    <input type="checkbox" checked={on} disabled={l.status !== "AVAILABLE"} onChange={() => toggle(l.id)} aria-label={`Select ${title}`} />
                  </label>
                )}
                <div className="w-[52px] shrink-0">
                  <GarmentImage src={l.coverUrl} alt={title} category={l.category ?? "draft"} className="!rounded-[10px]" />
                </div>
                <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
                  <Link href={editable ? `/seller/listings/${l.id}` : l.status === "AVAILABLE" ? `/p/${l.slug}` : `/seller/listings/${l.id}`} className="t-small line-clamp-2 font-bold !no-underline hover:!underline" style={{ color: "inherit" }}>
                    {title}
                  </Link>
                  <span className="t-small muted">{[l.tagSize, l.pricePaise !== null ? formatINR(l.pricePaise) : null].filter(Boolean).join(" · ") || "Not filled in yet"}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={b.tone}>{b.label}</StatusBadge>
                    {b.note && (
                      <span className="t-caption inline-flex items-center gap-1 !font-semibold">
                        {locked && <Lock aria-hidden className="ic ic-14" strokeWidth={ICON_STROKE} />}
                        {b.note}
                      </span>
                    )}
                  </span>
                </div>
                <span className="t-small muted hidden w-[100px] shrink-0 lg:block">{l.updated}</span>
                <div className="flex w-full flex-wrap items-center justify-end gap-1 sm:w-auto">
                  {l.status === "AVAILABLE" && (
                    <ButtonLink href={`/p/${l.slug}`} variant="ghost" size="sm" className="!h-11" aria-label={`View ${title}`}>
                      View
                    </ButtonLink>
                  )}
                  {editable && (
                    <ButtonLink href={`/seller/listings/${l.id}`} variant="ghost" size="sm" className="!h-11" aria-label={`Edit ${title}`}>
                      Edit
                    </ButtonLink>
                  )}
                  {l.status === "AVAILABLE" && <ListingStatusActions listingId={l.id} title={title} onDone={(a) => setNotice(a === "withdraw" ? "Withdrawn." : "Marked as sold elsewhere.")} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={bulk !== null}
        title={bulk === "withdraw" ? "Withdraw these pieces?" : "Mark these sold elsewhere?"}
        confirmLabel={bulk === "withdraw" ? "Withdraw" : "Mark as sold"}
        busy={busy}
        error={error}
        onConfirm={runBulk}
        onClose={() => {
          setBulk(null);
          setError(null);
        }}
      >
        <p>
          {selected.length} {selected.length === 1 ? "piece" : "pieces"}.{" "}
          {bulk === "withdraw" ? "They come off sale. You can relist them later from Withdrawn." : "They move to Sold and can't be bought on YOLT any more."}
        </p>
      </ConfirmDialog>
    </div>
  );
}
