"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatIndianMobile, INDIAN_STATES, validateAddress, type AddressError, type AddressInput } from "@yolt/shared";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";

export type SavedAddress = AddressInput & { id: string; isDefault: boolean };

const EMPTY: AddressInput = { name: "", phone: "", line1: "", line2: "", landmark: "", city: "", state: "", pincode: "" };

/** `/account/addresses` (board B6.19): list, add, edit, delete and set default, on /api/addresses. */
export function AddressBook({ initial, max }: { initial: SavedAddress[]; max: number }) {
  const router = useRouter();
  const [form, setForm] = useState<AddressInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AddressError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const errorFor = (f: keyof AddressInput) => fieldErrors.find((e) => e.field === f)?.message;
  const open = (a?: SavedAddress) => {
    setEditingId(a?.id ?? null);
    setForm(a ? { name: a.name, phone: a.phone, line1: a.line1, line2: a.line2 ?? "", landmark: a.landmark ?? "", city: a.city, state: a.state, pincode: a.pincode } : { ...EMPTY, makeDefault: initial.length === 0 } as AddressInput);
    setFieldErrors([]);
    setError(null);
  };

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    setBusy(false);
    return res;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const v = validateAddress(form);
    if (!v.ok) return setFieldErrors(v.errors);
    setFieldErrors([]);
    const res = await call(editingId ? `/api/addresses/${editingId}` : "/api/addresses", editingId ? "PUT" : "POST", form);
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string; details?: { errors?: AddressError[] } };
      if (b.details?.errors) return setFieldErrors(b.details.errors);
      return setError(b.error === "TOO_MANY" ? `You've saved the maximum of ${max} addresses.` : "Couldn't save the address. Try again.");
    }
    setForm(null);
    router.refresh();
  }

  async function act(url: string, method: string) {
    const res = await call(url, method);
    if (!res.ok) return setError("That didn't work. Try again.");
    setConfirmDelete(null);
    router.refresh();
  }

  const set = (patch: Partial<AddressInput>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="t-display">Addresses</h1>
        {!form && initial.length < max && initial.length > 0 && (
          <Button size="sm" className="!h-11" onClick={() => open()}>
            Add address
          </Button>
        )}
      </div>

      {form ? (
        <form onSubmit={save} noValidate className="card flex flex-col gap-3 p-4" aria-label={editingId ? "Edit address" : "New address"}>
          <Field label="Full name" error={errorFor("name")}>
            <input className="input" autoComplete="name" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Mobile number (for the courier)" error={errorFor("phone")}>
            <input className="input" type="tel" inputMode="numeric" autoComplete="tel-national" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Flat / house no., building, street" error={errorFor("line1")}>
            <input className="input" autoComplete="address-line1" value={form.line1} onChange={(e) => set({ line1: e.target.value })} />
          </Field>
          <Field label="Area, locality (optional)" error={errorFor("line2")}>
            <input className="input" autoComplete="address-line2" value={form.line2 ?? ""} onChange={(e) => set({ line2: e.target.value })} />
          </Field>
          <Field label="Landmark (optional)" error={errorFor("landmark")}>
            <input className="input" value={form.landmark ?? ""} onChange={(e) => set({ landmark: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pincode" error={errorFor("pincode")}>
              <input className="input" inputMode="numeric" maxLength={6} autoComplete="postal-code" value={form.pincode} onChange={(e) => set({ pincode: e.target.value.replace(/\D/g, "") })} />
            </Field>
            <Field label="City / town" error={errorFor("city")}>
              <input className="input" autoComplete="address-level2" value={form.city} onChange={(e) => set({ city: e.target.value })} />
            </Field>
          </div>
          <Field label="State" error={errorFor("state")}>
            <select className="input" autoComplete="address-level1" value={form.state} onChange={(e) => set({ state: e.target.value })}>
              <option value="">Choose…</option>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          {!editingId && initial.length > 0 && (
            <label className="opt t-small">
              <input type="checkbox" className="cbx" checked={Boolean((form as AddressInput & { makeDefault?: boolean }).makeDefault)} onChange={(e) => setForm({ ...form, makeDefault: e.target.checked } as AddressInput)} />
              Make this my default address
            </label>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="lg" loading={busy} className="flex-1">
              Save address
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setForm(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : initial.length === 0 ? (
        <EmptyState tag="Home" title="No saved addresses" action={<Button onClick={() => open()}>Add an address</Button>}>
          Save one here and checkout will offer it.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {initial.map((a) => (
            <li key={a.id} className="card flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="t-h3">{a.name}</span>
                {a.isDefault && <StatusBadge tone="neutral">Default</StatusBadge>}
              </div>
              <p className="t-small muted">
                {[a.line1, a.line2, a.landmark].filter(Boolean).join(", ")}, {a.city}, {a.state} {a.pincode}
              </p>
              <p className="t-small muted">{formatIndianMobile(a.phone)}</p>
              <div className="flex flex-wrap items-center gap-x-3">
                <Button variant="ghost" size="sm" className="!h-11 !px-0" onClick={() => open(a)} aria-label={`Edit address for ${a.name}`}>
                  Edit
                </Button>
                {!a.isDefault && (
                  <Button variant="ghost" size="sm" className="!h-11 !px-0" disabled={busy} onClick={() => act(`/api/addresses/${a.id}/default`, "POST")} aria-label={`Make address for ${a.name} the default`}>
                    Make default
                  </Button>
                )}
                {confirmDelete === a.id ? (
                  <span className="flex items-center gap-2">
                    <Button variant="danger" size="sm" className="!h-11" disabled={busy} onClick={() => act(`/api/addresses/${a.id}`, "DELETE")}>
                      Delete address
                    </Button>
                    <Button variant="ghost" size="sm" className="!h-11" onClick={() => setConfirmDelete(null)}>
                      Keep
                    </Button>
                  </span>
                ) : (
                  <Button variant="ghost" size="sm" className="!h-11 !px-0" onClick={() => setConfirmDelete(a.id)} aria-label={`Delete address for ${a.name}`}>
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p role="alert" className="t-small text-danger">
        {error}
      </p>
      <p className="t-small muted">Orders you&apos;ve placed keep the address they were sent to, even if you edit it here.</p>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      {label}
      {children}
      {error && <span className="help err">{error}</span>}
    </label>
  );
}
