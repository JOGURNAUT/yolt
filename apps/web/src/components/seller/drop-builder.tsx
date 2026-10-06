"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock } from "lucide-react";
import { GarmentImage } from "@/components/garment-image";
import { Button, ButtonLink } from "@/components/ui/button";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatINR } from "@/lib/format";
import { ConfirmDialog } from "./seller-dialog";
import { ShareLinkButton } from "./share-link-button";

type Row = { id: string; title: string; tagSize: string | null; pricePaise: number | null; status: string; ready: boolean; coverUrl?: string | null; missing?: string | null };

const ERRORS: Record<string, string> = {
  TOO_SOON: "Pick a time at least 10 minutes from now.",
  TOO_FAR: "Pick a time within the next 60 days.",
  INVALID_TITLE: "Give the drop a name (3–80 characters).",
  INCOMPLETE: "That item isn't complete yet. Finish its listing first.",
  NOT_JOINABLE: "That item is reserved or sold.",
  IN_ANOTHER_DROP: "That item is already in another drop.",
  DROP_LOCKED: "The drop is scheduled, so its items are locked.",
  EMPTY: "Add at least one item first.",
  ITEMS_CHANGED: "An item was reserved or sold since you added it. Remove it and try again.",
  SELLER_NOT_VERIFIED: "Finish KYC before scheduling a drop.",
  ALREADY_OPEN: "The drop has already opened.",
};

async function send(method: string, path: string, body?: unknown) {
  const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string; dropId?: string };
  return { ok: res.ok, data };
}

export function NewDropForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [max, setMax] = useState<1 | 2>(2);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="sec"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        // datetime-local is the seller's local time (IST for Indian phones); send it as an absolute instant.
        const startsAt = when ? new Date(when).toISOString() : "";
        const r = await send("POST", "/api/seller/drops", { title, startsAt, maxHoldsPerBuyer: max });
        if (r.ok && r.data.dropId) router.push(`/seller/drops/${r.data.dropId}`);
        else {
          setError(ERRORS[r.data.error ?? ""] ?? "Check the name and time.");
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
        <label className="field">
          Drop name
          <input className="input" value={title} minLength={3} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Winter Vintage Drop" required />
        </label>
        <label className="field">
          Opens at
          <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} required />
        </label>
        <label className="field">
          Max pieces per buyer
          <select className="input" value={max} onChange={(e) => setMax(Number(e.target.value) as 1 | 2)}>
            <option value={1}>1 at a time</option>
            <option value={2}>2 at a time</option>
          </select>
        </label>
      </div>
      <p className="help">Pick a time at least 10 minutes away and within 60 days. Announce it on Instagram with the drop link; pieces show as Coming soon until it opens.</p>
      <p role="alert" className={cx("t-small font-semibold text-danger", !error && "hidden")}>
        {error}
      </p>
      <div>
        <Button type="submit" size="lg" loading={busy}>
          Create drop
        </Button>
      </div>
    </form>
  );
}

type Preview = { title: string; when: string; max: number; storeName: string; sellerHandle: string };

export function DropBuilder({
  dropId,
  status,
  items,
  eligible,
  kycVerified,
  preview,
}: {
  dropId: string;
  status: string;
  items: Row[];
  eligible: Row[];
  kycVerified: boolean;
  preview: Preview;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<"schedule" | "cancel" | null>(null);
  const draft = status === "DRAFT";
  const scheduled = status === "SCHEDULED";

  async function act(method: string, path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const r = await send(method, path, body);
    setBusy(false);
    if (!r.ok) setError(ERRORS[r.data.error ?? ""] ?? "Something went wrong.");
    router.refresh();
    return r.ok;
  }

  async function confirm() {
    if (!asking) return;
    const ok = await act("POST", `/api/seller/drops/${dropId}/${asking}`);
    if (ok) setAsking(null);
  }

  const row = (r: Row, action: React.ReactNode) => (
    <li key={r.id} className="flex items-center gap-3 p-3">
      <div className="w-11 shrink-0">
        <GarmentImage src={r.coverUrl ?? null} alt={r.title} category="piece" className="is-sm !rounded-lg" />
      </div>
      <span className="flex min-w-0 grow flex-col gap-1">
        <span className="t-small line-clamp-2 font-bold">{r.title}</span>
        <span className="t-small muted">{[r.tagSize, r.pricePaise !== null ? formatINR(r.pricePaise) : null].filter(Boolean).join(" · ") || "Not filled in yet"}</span>
        {r.ready ? (
          <span>
            <StatusBadge tone="available">Ready</StatusBadge>
          </span>
        ) : (
          <span className="t-caption flex items-start gap-1.5 !font-semibold">
            <StatusBadge tone="reserved">Missing</StatusBadge>
            <span className="pt-0.5">{r.missing ?? "Finish its listing first."}</span>
          </span>
        )}
      </span>
      {action}
    </li>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <section aria-labelledby="in-drop-h" className="sec">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="in-drop-h" className="t-h2">
              Pieces
            </h2>
            <span className="t-small muted">{items.length} in this drop</span>
          </div>
          <ul className="card divide-y divide-line overflow-hidden">
            {items.length === 0 && <li className="t-small muted p-3">Add pieces from the list below.</li>}
            {items.map((r) =>
              row(
                r,
                draft ? (
                  <Button variant="ghost" size="sm" className="!h-11" disabled={busy} aria-label={`Remove ${r.title}`} onClick={() => act("DELETE", `/api/seller/drops/${dropId}/items/${r.id}`)}>
                    Remove
                  </Button>
                ) : (
                  <span className="t-caption muted inline-flex items-center gap-1">
                    <Lock aria-hidden className="ic ic-14" strokeWidth={ICON_STROKE} />
                    {r.status.toLowerCase().replace("_", " ")}
                  </span>
                ),
              ),
            )}
          </ul>
        </section>

        {draft && (
          <section aria-labelledby="add-h" className="sec">
            <h2 id="add-h" className="t-h2">
              Add pieces
            </h2>
            <p className="help">Only finished listings can go in a drop. Drafts stay hidden until it opens; live pieces leave your store until then.</p>
            <ul className="card divide-y divide-line overflow-hidden">
              {eligible.length === 0 && <li className="t-small muted p-3">No pieces available to add.</li>}
              {eligible.map((r) =>
                row(
                  r,
                  <Button variant="secondary" size="sm" className="!h-11" disabled={busy || !r.ready} aria-label={`Add ${r.title}`} onClick={() => act("POST", `/api/seller/drops/${dropId}/items`, { listingId: r.id })}>
                    Add
                  </Button>,
                ),
              )}
            </ul>
          </section>
        )}

        <section aria-labelledby="rules-h" className="sec">
          <h2 id="rules-h" className="t-h2">
            Rules
          </h2>
          <p className="t-small">
            Max <strong>{preview.max}</strong> {preview.max === 1 ? "piece" : "pieces"} per buyer at a time.
          </p>
          <p className="t-small muted">Every drop: first to claim gets 5 minutes to pay. Unpaid pieces go back on sale.</p>
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24">
        <section aria-label="How buyers see it" className="card flex flex-col gap-3 p-4">
          <span className="t-caption muted">HOW BUYERS SEE IT</span>
          <div className="ticket min-h-[120px]">
            <div className="flex min-w-0 grow flex-col gap-1.5 p-3.5">
              <span className="t-caption opacity-85">{preview.storeName}</span>
              <span className="t-h2 !normal-case">{preview.title}</span>
              <span className="t-mono !text-xs">{preview.when}</span>
              <span className="t-caption !font-medium">
                {items.length} {items.length === 1 ? "piece" : "pieces"} · max {preview.max} per person
              </span>
            </div>
            <div className="stub" aria-hidden="true">
              <span className="notch" style={{ left: -10, top: -24 }} />
              <span className="notch" style={{ left: -10, bottom: -24 }} />
            </div>
            <div aria-hidden="true" className="flex w-[110px] shrink-0 items-center justify-center p-2.5">
              <span className="btn btn-sm btn-primary w-full !whitespace-normal text-center">Remind me</span>
            </div>
          </div>
        </section>

        {draft && (
          <section aria-label="Schedule" className="sec is-emphasis">
            <p className="t-small flex items-start gap-2.5">
              <Lock aria-hidden className="ic mt-0.5" strokeWidth={ICON_STROKE} />
              <span>
                <strong>Items are locked once the drop is scheduled.</strong> You can&apos;t edit their price, photos or details until it opens, so buyers see exactly what they were reminded about.
              </span>
            </p>
            <Button size="lg" block disabled={busy || items.length === 0 || !kycVerified} onClick={() => setAsking("schedule")}>
              Schedule drop
            </Button>
            {!kycVerified && <p className="t-small text-danger">Finish KYC before scheduling a drop.</p>}
            <Button variant="ghost" className="!text-danger" disabled={busy} onClick={() => setAsking("cancel")}>
              Cancel drop
            </Button>
          </section>
        )}

        {scheduled && (
          <section aria-label="Scheduled" className="sec">
            <h2 className="t-h3 !normal-case">Scheduled</h2>
            <p className="t-small muted">The pieces are locked and show as Coming soon. Followers can set reminders now.</p>
            <ButtonLink href={`/d/${dropId}`} block>
              View drop page
            </ButtonLink>
            <ShareLinkButton path={`/d/${dropId}`} sellerHandle={preview.sellerHandle} label="Copy drop link" className="w-full" />
            <Button variant="ghost" className="!text-danger" disabled={busy} onClick={() => setAsking("cancel")}>
              Cancel drop
            </Button>
            <p className="help">Cancelling takes the pieces off sale; you can relist them.</p>
          </section>
        )}

        {(status === "LIVE" || status === "ENDED") && (
          <section aria-label="Drop page" className="sec">
            <ButtonLink href={`/d/${dropId}`} block>
              View drop page
            </ButtonLink>
            <ShareLinkButton path={`/d/${dropId}`} sellerHandle={preview.sellerHandle} label="Copy drop link" className="w-full" />
            {status === "LIVE" && <p className="help">The drop is open. Only YOLT staff can pause it.</p>}
          </section>
        )}

        <p role="alert" className={cx("t-small font-semibold text-danger", (!error || asking !== null) && "hidden")}>
          {asking === null && error}
        </p>
      </aside>

      <ConfirmDialog
        open={asking !== null}
        title={asking === "schedule" ? "Schedule this drop?" : "Cancel this drop?"}
        confirmLabel={asking === "schedule" ? "Schedule drop" : "Cancel drop"}
        tone={asking === "cancel" ? "danger" : "primary"}
        busy={busy}
        error={error}
        onConfirm={confirm}
        onClose={() => {
          setAsking(null);
          setError(null);
        }}
      >
        <p>{asking === "schedule" ? "Its pieces are locked as Coming soon until the drop opens." : "Its pieces are taken off sale. You can relist them."}</p>
      </ConfirmDialog>
    </div>
  );
}
