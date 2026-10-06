"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { Stamp } from "@/components/ui/stamp";
import { SellerDialog } from "./seller-dialog";

export type SoldCandidate = { id: string; title: string; meta: string; coverUrl: string | null; locked?: string };

export const SOLD_ERRORS: Record<string, string> = {
  BUYER_CHECKING_OUT: "A buyer is paying for this right now. Try again in a few minutes.",
  NOT_AVAILABLE: "This item isn't live any more.",
};

/**
 * "Mark sold elsewhere" (boards MarkSold, MarkSoldDone): pick a live piece that sold on Instagram or
 * in person and take it off the store. Pieces a buyer is paying for are listed but locked.
 */
export function MarkSoldButton({ items, className, label = "Mark sold elsewhere" }: { items: SoldCandidate[]; className?: string; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SoldCandidate | null>(null);

  const shown = useMemo(() => items.filter((i) => i.title.toLowerCase().includes(query.trim().toLowerCase())), [items, query]);

  function close() {
    setOpen(false);
    setQuery("");
    setPicked(null);
    setError(null);
    if (done) router.refresh();
    setDone(null);
  }

  async function confirm() {
    const item = items.find((i) => i.id === picked);
    if (!item) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/seller/listings/${item.id}/sold-elsewhere`, { method: "POST" });
    setBusy(false);
    if (res.ok) return setDone(item);
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(SOLD_ERRORS[body.error ?? ""] ?? "Something went wrong. Try again.");
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} className={className}>
        {label}
      </Button>
      <SellerDialog open={open} onClose={close} title={done ? "Off your store." : "Mark sold elsewhere"}>
        {done ? (
          <div role="status" className="flex flex-col items-center gap-3 text-center">
            <Stamp wobble>
              <span className="dot" aria-hidden="true" />
              Sold elsewhere
            </Stamp>
            <p className="t-body muted">
              {done.title} is marked sold. It&apos;s in Listings under Sold.
            </p>
            <Button size="lg" block onClick={close}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <p className="t-small muted">Sold on Instagram, in person or anywhere else?</p>
            <label className="search w-full">
              <Search aria-hidden className="ic" strokeWidth={ICON_STROKE} />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find the piece" placeholder="Find the piece" />
            </label>
            {items.length === 0 ? (
              <p className="t-small muted">Nothing is live right now.</p>
            ) : shown.length === 0 ? (
              <p className="t-small muted">No live piece matches &ldquo;{query}&rdquo;.</p>
            ) : (
              <fieldset className="m-0 flex max-h-[40vh] min-w-0 flex-col gap-2 overflow-auto border-0 p-0">
                <legend className="sr-only">Piece</legend>
                {shown.map((i) => (
                  <label key={i.id} className={cx("choice !items-center !p-2.5")}>
                    <input type="radio" name="piece" value={i.id} disabled={Boolean(i.locked)} checked={picked === i.id} onChange={() => setPicked(i.id)} />
                    <span className="radio" aria-hidden="true" />
                    {i.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- seller's own photo
                      <img src={i.coverUrl} alt="" className="h-[45px] w-9 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span aria-hidden="true" className="h-[45px] w-9 shrink-0 rounded-md bg-surface-2" />
                    )}
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="t-small font-bold">{i.title}</span>
                      <span className="t-small muted">{i.locked ?? i.meta}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            <p className="t-small rounded-xl bg-surface-2 p-3">It moves to Sold straight away and can&apos;t be bought on YOLT any more.</p>
            <p role="alert" className={cx("t-small text-danger", !error && "hidden")}>
              {error}
            </p>
            <Button size="lg" block loading={busy} disabled={!picked} onClick={confirm}>
              Mark as sold
            </Button>
          </>
        )}
      </SellerDialog>
    </>
  );
}
