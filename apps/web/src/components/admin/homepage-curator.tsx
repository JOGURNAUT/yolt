"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/icon-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatINR, formatIST } from "@/lib/format";
import { adminRequest, reasonOk, type AdminResult } from "./admin-api";
import { AdminError, REASON_ERROR, ReasonDialog, ReasonField, ReadOnlyNote } from "./admin-ui";

export type Kind = "FEATURED_STORE" | "GRAILS" | "EDIT";
export type SlotView = {
  id: string;
  kind: Kind;
  sellerId: string | null;
  sellerName: string | null;
  sellerHandle: string | null;
  title: string | null;
  listingIds: string[];
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  state: "CURRENT" | "UPCOMING" | "EXPIRED";
  winning: boolean;
};
export type PieceView = { id: string; title: string; pricePaise: number | null; coverUrl: string | null; sellerName: string; live: boolean };
type Store = { id: string; name: string; handle: string };

const MAX_PIECES = 12;
const KINDS: { kind: Kind; label: string; save: string; blurb: string; fallback: string }[] = [
  { kind: "FEATURED_STORE", label: "Featured store", save: "Save featured store", blurb: "One approved store, shown with its newest pieces.", fallback: "Nothing curated: the homepage shows the store with the most pieces in stock." },
  { kind: "GRAILS", label: "Grails list", save: "Save Grails list", blurb: "Up to 12 live pieces, shown in this order.", fallback: "Nothing curated: the Grails section stays empty. It is never filled automatically." },
  { kind: "EDIT", label: "The edit", save: "Save the edit", blurb: "A title (3 to 40 characters) and up to 12 live pieces.", fallback: "Nothing curated: the edit is not shown." },
];

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? `${v}:00+05:30` : null);

type Form = { sellerId: string; title: string; ids: string[]; from: string; until: string };
const blank: Form = { sellerId: "", title: "", ids: [], from: "", until: "" };
const formOf = (s: SlotView | undefined): Form =>
  s ? { sellerId: s.sellerId ?? "", title: s.title ?? "", ids: s.listingIds, from: toLocal(s.startsAt), until: toLocal(s.endsAt) } : blank;

export function HomepageCurator({ canWrite, slots, stores, candidates, pieces }: { canWrite: boolean; slots: SlotView[]; stores: Store[]; candidates: PieceView[]; pieces: PieceView[] }) {
  const router = useRouter();
  const storeId = useId();
  const known = useMemo(() => new Map([...candidates, ...pieces].map((p) => [p.id, p])), [candidates, pieces]);
  const winner = (k: Kind) => slots.find((s) => s.kind === k && s.winning);

  const [kind, setKind] = useState<Kind>("GRAILS");
  const [editing, setEditing] = useState<string | null>(winner("GRAILS")?.id ?? null);
  const [form, setForm] = useState<Form>(formOf(winner("GRAILS")));
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [failure, setFailure] = useState<Extract<AdminResult, { ok: false }> | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<"update" | "new" | null>(null);
  const [removing, setRemoving] = useState<SlotView | null>(null);

  const meta = KINDS.find((k) => k.kind === kind)!;

  function load(next: Kind, slot?: SlotView) {
    setKind(next);
    setEditing(slot?.id ?? null);
    setForm(formOf(slot));
    setReason("");
    setReasonError(null);
    setFailure(null);
    setSaved(null);
  }

  async function save(mode: "update" | "new") {
    setFailure(null);
    setSaved(null);
    if (!reasonOk(reason)) return setReasonError(REASON_ERROR);
    setReasonError(null);
    const when = { startsAt: fromLocal(form.from), endsAt: fromLocal(form.until) };
    const content = kind === "FEATURED_STORE" ? { sellerId: form.sellerId || null } : { listingIds: form.ids, ...(kind === "EDIT" ? { title: form.title } : {}) };
    setBusy(mode);
    const r =
      mode === "update" && editing
        ? await adminRequest<{ id: string }>("PATCH", `/api/admin/homepage-slots/${editing}`, { ...content, ...when, reason: reason.trim() })
        : await adminRequest<{ id: string }>("POST", "/api/admin/homepage-slots", { kind, ...content, ...when, reason: reason.trim() });
    setBusy(null);
    if (!r.ok) return setFailure(r);
    setEditing(r.data.id);
    setReason("");
    const future = form.from && new Date(fromLocal(form.from)!) > new Date();
    setSaved(future ? `Saved. It will show on the homepage from ${formatIST(fromLocal(form.from)!)}.` : "Saved. It is on the homepage now.");
    router.refresh();
  }

  const setIds = (ids: string[]) => setForm({ ...form, ids });
  const showing = winner(kind);

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Homepage slot" className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button key={k.kind} type="button" aria-pressed={k.kind === kind} className={cx("pill", k.kind === kind && "is-active")} onClick={() => load(k.kind, winner(k.kind))}>
            {k.label}
          </button>
        ))}
      </nav>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <section className="sec" aria-labelledby="editor-h">
          <div>
            <h2 id="editor-h" className="t-h2">
              {meta.label}
            </h2>
            <p className="t-small muted mt-1">{meta.blurb}</p>
          </div>
          <p className="t-small rounded-xl bg-surface-2 p-3">
            <strong>On the homepage now:</strong> {showing ? summary(showing, known) : meta.fallback}
          </p>

          {!canWrite ? (
            <ReadOnlyNote>Read-only: SUPPORT staff can see the homepage picks but only an admin can change them.</ReadOnlyNote>
          ) : (
            <form
              className="flex flex-col gap-4"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void save("update");
              }}
            >
              {editing && <p className="t-small muted">Editing an existing entry. Use “Add as a new entry” to keep it and add another.</p>}

              {kind === "FEATURED_STORE" && (
                <div className="field">
                  <label htmlFor={storeId}>Store</label>
                  <select id={storeId} className="input" value={form.sellerId} onChange={(e) => setForm({ ...form, sellerId: e.target.value })}>
                    <option value="">Choose a store…</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (@{s.handle})
                      </option>
                    ))}
                  </select>
                  <span className="help">Only approved stores can be featured.</span>
                </div>
              )}

              {kind === "EDIT" && (
                <label className="field">
                  Title
                  <input className="input" maxLength={40} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  <span className="help">{form.title.trim().length} / 40 · at least 3 characters</span>
                </label>
              )}

              {kind !== "FEATURED_STORE" && <PiecePicker ids={form.ids} onChange={setIds} known={known} candidates={candidates} />}

              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="t-small mb-2 font-bold">Schedule (optional, IST)</legend>
                <label className="field">
                  Show from
                  <input type="datetime-local" className="input" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
                </label>
                <label className="field">
                  Until
                  <input type="datetime-local" className="input" value={form.until} onChange={(e) => setForm({ ...form, until: e.target.value })} />
                </label>
                <p className="help sm:col-span-2">Leave both empty to show it right away with no end. Where several entries are in their window, the newest one wins.</p>
              </fieldset>

              <ReasonField
                value={reason}
                onChange={(v) => {
                  setReason(v);
                  if (reasonOk(v)) setReasonError(null);
                }}
                error={reasonError}
                placeholder="Why these picks?"
              />
              <AdminError failure={failure} />
              {saved && (
                <p role="status" className="t-small font-semibold">
                  {saved}
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" size="lg" loading={busy === "update"} disabled={busy !== null}>
                  {meta.save}
                </Button>
                {editing && (
                  <Button variant="secondary" size="lg" loading={busy === "new"} disabled={busy !== null} onClick={() => void save("new")}>
                    Add as a new entry
                  </Button>
                )}
              </div>
            </form>
          )}
        </section>

        <Preview kind={kind} form={form} stores={stores} known={known} className="lg:sticky lg:top-24" />
      </div>

      <section className="sec" aria-labelledby="history-h">
        <div>
          <h2 id="history-h" className="t-h2">
            All entries ({slots.length})
          </h2>
          <p className="t-small muted mt-1">Newest first. Every change is in the audit log.</p>
        </div>
        {slots.length === 0 ? (
          <p className="t-small muted">Nothing curated yet.</p>
        ) : (
          <ul className="m-0 list-none divide-y divide-line p-0">
            {slots.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                <div className="min-w-0">
                  <p className="t-body flex flex-wrap items-center gap-2">
                    <span className="font-bold">{KINDS.find((k) => k.kind === s.kind)!.label}</span>
                    {s.winning ? (
                      <StatusBadge tone="available">Showing now</StatusBadge>
                    ) : s.state === "CURRENT" ? (
                      <StatusBadge tone="neutral">Hidden by a newer entry</StatusBadge>
                    ) : s.state === "UPCOMING" ? (
                      <StatusBadge tone="soon">Upcoming</StatusBadge>
                    ) : (
                      <StatusBadge tone="removed">Expired</StatusBadge>
                    )}
                  </p>
                  <p className="t-small muted">
                    {summary(s, known)} · {windowText(s)} · added {formatIST(s.createdAt)}
                  </p>
                </div>
                {canWrite && (
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" className="!h-11 lg:!h-10" onClick={() => load(s.kind, s)}>
                      Edit<span className="sr-only"> {KINDS.find((k) => k.kind === s.kind)!.label} entry</span>
                    </Button>
                    <Button variant="secondary" size="sm" className="!h-11 !text-danger lg:!h-10" onClick={() => setRemoving(s)}>
                      Remove<span className="sr-only"> {KINDS.find((k) => k.kind === s.kind)!.label} entry</span>
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReasonDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove this entry?"
        intro={removing ? `${KINDS.find((k) => k.kind === removing.kind)!.label}: ${summary(removing, known)}. If an older entry is still in its window it shows again; otherwise the homepage falls back to its default.` : undefined}
        confirmLabel="Remove entry"
        tone="danger"
        onSubmit={async (reason) => {
          const r = await adminRequest("DELETE", `/api/admin/homepage-slots/${removing!.id}`, { reason });
          if (r.ok) {
            if (editing === removing!.id) load(kind, undefined);
            router.refresh();
          }
          return r;
        }}
      />
    </div>
  );
}

function summary(s: SlotView, known: Map<string, PieceView>) {
  if (s.kind === "FEATURED_STORE") return s.sellerName ?? "A store";
  const n = s.listingIds.length;
  const live = s.listingIds.filter((id) => known.get(id)?.live).length;
  const count = `${n} ${n === 1 ? "piece" : "pieces"}${live < n ? ` (${live} still live)` : ""}`;
  return s.kind === "EDIT" ? `“${s.title}” · ${count}` : count;
}

function windowText(s: SlotView) {
  if (!s.startsAt && !s.endsAt) return "no schedule";
  return `${s.startsAt ? `from ${formatIST(s.startsAt)}` : "from now"}${s.endsAt ? ` until ${formatIST(s.endsAt)}` : ""}`;
}

function Thumb({ piece, className }: { piece: PieceView | undefined; className?: string }) {
  return piece?.coverUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- seller's photo
    <img src={piece.coverUrl} alt="" className={cx("shrink-0 rounded-[10px] bg-surface-2 object-cover", className)} />
  ) : (
    <span aria-hidden className={cx("shrink-0 rounded-[10px] bg-surface-2", className)} />
  );
}

/** The ordered pieces plus a search over live ones. Order matters: it is the order buyers see. */
function PiecePicker({ ids, onChange, known, candidates }: { ids: string[]; onChange: (ids: string[]) => void; known: Map<string, PieceView>; candidates: PieceView[] }) {
  const searchId = useId();
  const [q, setQ] = useState("");
  const full = ids.length >= MAX_PIECES;
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return candidates.filter((c) => !ids.includes(c.id) && (!needle || `${c.title} ${c.sellerName}`.toLowerCase().includes(needle))).slice(0, 30);
  }, [candidates, ids, q]);
  const move = (i: number, d: -1 | 1) => {
    const next = [...ids];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="t-small font-bold">Pieces, in order</h3>
        <p role="status" className="t-small muted">
          {ids.length} of {MAX_PIECES}
        </p>
      </div>
      {ids.length === 0 ? (
        <p className="t-small muted">No pieces yet. Add some from the list below.</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {ids.map((id, i) => {
            const p = known.get(id);
            return (
              <li key={id} className="flex items-center gap-2 rounded-xl bg-surface-2 p-2">
                <span className="t-small w-6 text-center font-bold">{i + 1}</span>
                <Thumb piece={p} className="size-11" />
                <span className="t-small min-w-0 grow">
                  <span className="block truncate font-bold">{p?.title ?? "Unknown piece"}</span>
                  <span className="muted block truncate">
                    {p ? `${p.sellerName}${p.pricePaise !== null ? ` · ${formatINR(p.pricePaise)}` : ""}` : ""}
                  </span>
                  {!p?.live && <span className="block font-bold text-danger">No longer live: remove it before saving</span>}
                </span>
                <IconButton label={`Move ${p?.title ?? "piece"} up`} plain disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp aria-hidden className="ic" strokeWidth={ICON_STROKE} />
                </IconButton>
                <IconButton label={`Move ${p?.title ?? "piece"} down`} plain disabled={i === ids.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown aria-hidden className="ic" strokeWidth={ICON_STROKE} />
                </IconButton>
                <IconButton label={`Remove ${p?.title ?? "piece"}`} plain onClick={() => onChange(ids.filter((x) => x !== id))}>
                  <X aria-hidden className="ic" strokeWidth={ICON_STROKE} />
                </IconButton>
              </li>
            );
          })}
        </ol>
      )}

      <div className="field">
        <label htmlFor={searchId}>Find a live piece</label>
        <input id={searchId} type="search" className="input" placeholder="Title or store" value={q} onChange={(e) => setQ(e.target.value)} />
        {full && <span className="help err">That&apos;s the maximum of {MAX_PIECES}. Remove one to add another.</span>}
      </div>
      <ul aria-label="Live pieces" className="m-0 flex max-h-[320px] list-none flex-col gap-1.5 overflow-y-auto p-0">
        {matches.length === 0 && <li className="t-small muted">No matching live pieces.</li>}
        {matches.map((c) => (
          <li key={c.id} className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-surface-2">
            <Thumb piece={c} className="size-11" />
            <span className="t-small min-w-0 grow">
              <span className="block truncate font-bold">{c.title}</span>
              <span className="muted block truncate">
                {c.sellerName}
                {c.pricePaise !== null && ` · ${formatINR(c.pricePaise)}`}
              </span>
            </span>
            <Button variant="secondary" size="sm" className="!h-11 shrink-0" disabled={full} onClick={() => onChange([...ids, c.id])}>
              <Plus aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />
              Add<span className="sr-only"> {c.title}</span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A rough view of the slot as the landing page will show it, from what is in the form. */
function Preview({ kind, form, stores, known, className }: { kind: Kind; form: Form; stores: Store[]; known: Map<string, PieceView>; className?: string }) {
  const store = stores.find((s) => s.id === form.sellerId);
  const items = form.ids.map((id) => known.get(id)).filter((p): p is PieceView => !!p && p.live);
  return (
    <section className={cx("sec", className)} aria-labelledby="preview-h">
      <div>
        <h2 id="preview-h" className="t-h2">
          Preview
        </h2>
        <p className="t-small muted mt-1">A rough view of what buyers will see. The real page lays it out in its own sections.</p>
      </div>
      {kind === "FEATURED_STORE" ? (
        store ? (
          <div className="card flex items-center gap-3 p-4">
            <span aria-hidden className="wordmark flex size-12 shrink-0 items-center justify-center rounded-full bg-[#0d0d0c] text-sm text-white">
              {store.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="t-caption muted block uppercase">Featured store</span>
              <span className="t-h3 block truncate">{store.name}</span>
              <span className="t-small muted block">yolt.in/s/{store.handle}</span>
            </span>
          </div>
        ) : (
          <p className="t-small muted">Choose a store to preview it.</p>
        )
      ) : items.length === 0 ? (
        <p className="t-small muted">Add pieces to preview the {kind === "GRAILS" ? "Grails list" : "edit"}.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="t-h2 !normal-case">{kind === "EDIT" ? form.title.trim() || "Untitled edit" : "Grails"}</p>
          <ol className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((p, i) => (
              <li key={p.id} className="flex flex-col gap-1">
                <span className="relative block aspect-[4/5] overflow-hidden rounded-xl bg-surface-2">
                  {p.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- seller's photo
                    <img src={p.coverUrl} alt="" className="size-full object-cover" />
                  )}
                  <span className="badge neutral absolute left-1.5 top-1.5 !h-5 !px-1.5">{i + 1}</span>
                </span>
                <span className="t-caption truncate">{p.title}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
