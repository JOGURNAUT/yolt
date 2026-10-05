"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatINR } from "@/lib/format";

type Row = { id: string; title: string; tagSize: string | null; pricePaise: number | null; status: string; ready: boolean };

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
  return (
    <form
      className="grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        // datetime-local is the seller's local time (IST for Indian phones); send it as an absolute instant.
        const startsAt = when ? new Date(when).toISOString() : "";
        const r = await send("POST", "/api/seller/drops", { title, startsAt, maxHoldsPerBuyer: max });
        if (r.ok && r.data.dropId) router.push(`/seller/drops/${r.data.dropId}`);
        else setError(ERRORS[r.data.error ?? ""] ?? "Check the name and time.");
      }}
    >
      <label className="space-y-1 text-sm">
        Name
        <input className="w-full rounded-md border border-line bg-background px-2 py-1.5" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Winter Vintage Drop" required />
      </label>
      <label className="space-y-1 text-sm">
        Opens at
        <input type="datetime-local" className="w-full rounded-md border border-line bg-background px-2 py-1.5" value={when} onChange={(e) => setWhen(e.target.value)} required />
      </label>
      <label className="space-y-1 text-sm">
        Per buyer
        <select className="w-full rounded-md border border-line bg-background px-2 py-1.5" value={max} onChange={(e) => setMax(Number(e.target.value) as 1 | 2)}>
          <option value={1}>1 at a time</option>
          <option value={2}>2 at a time</option>
        </select>
      </label>
      <button type="submit" className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background">Create</button>
      {error && <p role="alert" className="text-sm text-danger sm:col-span-4">{error}</p>}
    </form>
  );
}

export function DropBuilder({ dropId, status, items, eligible, kycVerified }: { dropId: string; status: string; items: Row[]; eligible: Row[]; kycVerified: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const draft = status === "DRAFT";

  async function act(method: string, path: string, body?: unknown, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setError(null);
    const r = await send(method, path, body);
    setBusy(false);
    if (!r.ok) setError(ERRORS[r.data.error ?? ""] ?? "Something went wrong.");
    router.refresh();
  }

  const row = (r: Row, action: React.ReactNode) => (
    <li key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
      <span>
        {r.title}
        <span className="text-muted">{[r.tagSize, r.pricePaise !== null ? formatINR(r.pricePaise) : null].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
        {!r.ready && <span className="ml-2 text-xs text-danger">incomplete</span>}
      </span>
      {action}
    </li>
  );

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-semibold">In this drop ({items.length})</h2>
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {items.length === 0 && <li className="p-3 text-sm text-muted">Add items below.</li>}
          {items.map((r) =>
            row(r, draft ? <button type="button" disabled={busy} onClick={() => act("DELETE", `/api/seller/drops/${dropId}/items/${r.id}`)} className="text-xs text-muted underline">Remove</button> : <span className="text-xs text-muted">{r.status.toLowerCase()}</span>),
          )}
        </ul>
      </section>

      {draft && (
        <section className="space-y-2">
          <h2 className="font-semibold">Add items</h2>
          <p className="text-xs text-muted">Complete drafts are best: they stay hidden until the drop opens. Live items leave the shop until then.</p>
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {eligible.length === 0 && <li className="p-3 text-sm text-muted">No items available to add.</li>}
            {eligible.map((r) =>
              row(r, <button type="button" disabled={busy || !r.ready} onClick={() => act("POST", `/api/seller/drops/${dropId}/items`, { listingId: r.id })} className="rounded-full border border-line px-3 py-1 text-xs disabled:opacity-40">Add</button>),
            )}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {draft && (
          <button
            type="button"
            disabled={busy || items.length === 0 || !kycVerified}
            onClick={() => act("POST", `/api/seller/drops/${dropId}/schedule`, undefined, "Schedule this drop? Its items are locked as Coming soon until it opens.")}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-40"
          >
            Schedule drop
          </button>
        )}
        {(draft || status === "SCHEDULED") && (
          <button type="button" disabled={busy} onClick={() => act("POST", `/api/seller/drops/${dropId}/cancel`, undefined, "Cancel this drop? Its items are taken off sale; you can relist them.")} className="rounded-full border border-line px-4 py-2 text-sm">
            Cancel drop
          </button>
        )}
      </div>
      {!kycVerified && draft && <p className="text-sm text-danger">Finish KYC before scheduling a drop.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
