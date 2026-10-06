"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./seller-dialog";
import { SOLD_ERRORS } from "./mark-sold";

type Action = "sold-elsewhere" | "withdraw";

const COPY: Record<Action, { title: string; body: string; confirm: string; tone: "primary" | "danger" }> = {
  "sold-elsewhere": {
    title: "Mark sold elsewhere?",
    body: "Sold on Instagram or in person? It moves to Sold and can't be bought on YOLT any more.",
    confirm: "Mark as sold",
    tone: "primary",
  },
  withdraw: {
    title: "Take this off sale?",
    body: "Buyers won't see it any more. You can relist it later from Withdrawn.",
    confirm: "Withdraw",
    tone: "primary",
  },
};

/** One call to the seller API; the message is ready to show when it fails. */
export async function runListingAction(listingId: string, action: Action): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch(`/api/seller/listings/${listingId}/${action}`, { method: "POST" });
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, message: SOLD_ERRORS[body.error ?? ""] ?? "Something went wrong. Try again." };
}

/**
 * Sold elsewhere and Withdraw for one live listing, each behind a confirm dialog (replaces the old
 * browser confirm). Used on the listings rows and the live editor.
 */
export function ListingStatusActions({ listingId, title, block = false, onDone }: { listingId: string; title: string; block?: boolean; onDone?: (action: Action) => void }) {
  const router = useRouter();
  const [asking, setAsking] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!asking) return;
    setBusy(true);
    setError(null);
    const r = await runListingAction(listingId, asking);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    const done = asking;
    setAsking(null);
    onDone?.(done);
    router.refresh();
  }

  const cls = block ? "w-full" : "";
  return (
    <>
      <Button variant="secondary" size="sm" className={`!h-11 ${cls}`} aria-label={`Sold elsewhere: ${title}`} onClick={() => setAsking("sold-elsewhere")}>
        Sold elsewhere
      </Button>
      <Button variant="ghost" size="sm" className={`!h-11 ${cls}`} aria-label={`Withdraw: ${title}`} onClick={() => setAsking("withdraw")}>
        Withdraw
      </Button>
      <ConfirmDialog
        open={asking !== null}
        title={asking ? COPY[asking].title : ""}
        confirmLabel={asking ? COPY[asking].confirm : ""}
        tone={asking ? COPY[asking].tone : "primary"}
        busy={busy}
        error={error}
        onConfirm={confirm}
        onClose={() => {
          setAsking(null);
          setError(null);
        }}
      >
        <p className="t-body-lg !font-bold text-foreground">{title}</p>
        <p>{asking ? COPY[asking].body : ""}</p>
      </ConfirmDialog>
    </>
  );
}
