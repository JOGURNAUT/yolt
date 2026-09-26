"use client";

import { useCallback, useEffect, useState } from "react";
import { formatIndianMobile, INDIAN_STATES, validateAddress, type AddressError, type AddressInput } from "@yolt/shared";

type Address = {
  id: string;
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
};

type Snapshot = { name: string; line1: string; city: string; pincode: string } | null;

const EMPTY: AddressInput = { name: "", phone: "", line1: "", line2: "", landmark: "", city: "", state: "", pincode: "" };

const SET_ERRORS: Record<string, string> = {
  NOT_SERVICEABLE: "Couriers can't deliver to this pincode yet. Choose another address.",
  PAYMENT_IN_PROGRESS: "Payment has started, so the address can't be changed now.",
  SELLER_PICKUP_UNKNOWN: "This store hasn't set a pickup location yet, so we can't ship this order.",
  SHIPPING_UNAVAILABLE: "Delivery checks are unavailable right now. Try again in a minute.",
};

/**
 * Checkout step 2: pick or add a delivery address. The server checks the pincode is
 * deliverable before attaching it to the order; payment is refused without one.
 */
export function AddressStep({
  orderId,
  current,
  locked,
  onChosen,
}: {
  orderId: string;
  current: Snapshot;
  locked: boolean;
  onChosen: () => void;
}) {
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(current === null);
  const [form, setForm] = useState<AddressInput>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<AddressError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/addresses", { cache: "no-store" });
    if (!res.ok) return;
    const list = (await res.json()) as Address[];
    setAddresses(list);
    if (list.length === 0) setAdding(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; state is set after the await
    void load();
  }, [load]);

  async function choose(addressId: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/orders/${orderId}/address`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ addressId }),
    });
    setBusy(false);
    const body = (await res.json().catch(() => ({}))) as { error?: string; etaDaysMin?: number; etaDaysMax?: number };
    if (!res.ok) return setError(SET_ERRORS[body.error ?? ""] ?? "Couldn't use this address. Try again.");
    setEta(`Delivers in ${body.etaDaysMin}–${body.etaDaysMax} days after dispatch.`);
    setEditing(false);
    onChosen();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const v = validateAddress(form);
    if (!v.ok) return setFieldErrors(v.errors);
    setFieldErrors([]);
    setBusy(true);
    const res = await fetch("/api/addresses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    const body = (await res.json().catch(() => ({}))) as Address & { error?: string; details?: { errors?: AddressError[] } };
    if (!res.ok) {
      if (body.details?.errors) return setFieldErrors(body.details.errors);
      return setError(body.error === "TOO_MANY" ? "You've saved the maximum number of addresses." : "Couldn't save the address.");
    }
    setAdding(false);
    setForm(EMPTY);
    await load();
    await choose(body.id);
  }

  const errorFor = (field: keyof AddressInput) => fieldErrors.find((e) => e.field === field)?.message;
  const input = "w-full rounded-md border border-line bg-background px-3 py-2";

  if (!editing && current) {
    return (
      <section className="rounded-lg border border-line bg-surface p-4 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">Deliver to {current.name}</p>
            <p className="text-muted">
              {current.line1}, {current.city} {current.pincode}
            </p>
            {eta && <p className="mt-1">{eta}</p>}
          </div>
          {!locked && (
            <button type="button" onClick={() => setEditing(true)} className="underline">
              Change
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Delivery address</h2>

      {addresses && addresses.length > 0 && !adding && (
        <ul className="space-y-2">
          {addresses.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => choose(a.id)}
                className="w-full rounded-lg border border-line bg-surface p-3 text-left text-sm hover:border-foreground disabled:opacity-60"
              >
                <span className="font-medium">{a.name}</span>
                {a.isDefault && <span className="ml-2 rounded bg-placeholder px-1.5 text-xs">Default</span>}
                <span className="block text-muted">
                  {[a.line1, a.line2, a.landmark].filter(Boolean).join(", ")}, {a.city}, {a.state} {a.pincode}
                </span>
                <span className="block text-muted">{formatIndianMobile(a.phone)}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setAdding(true)} className="text-sm underline">
              + Add a new address
            </button>
          </li>
        </ul>
      )}

      {adding && (
        <form onSubmit={save} className="space-y-3 rounded-lg border border-line bg-surface p-4" noValidate>
          <Field label="Full name" error={errorFor("name")}>
            <input className={input} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Mobile number (for the courier)" error={errorFor("phone")}>
            <input className={input} type="tel" inputMode="numeric" autoComplete="tel-national" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Flat / house no., building, street" error={errorFor("line1")}>
            <input className={input} autoComplete="address-line1" value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} />
          </Field>
          <Field label="Area, locality (optional)" error={errorFor("line2")}>
            <input className={input} autoComplete="address-line2" value={form.line2 ?? ""} onChange={(e) => setForm({ ...form, line2: e.target.value })} />
          </Field>
          <Field label="Landmark (optional)" error={errorFor("landmark")}>
            <input className={input} value={form.landmark ?? ""} onChange={(e) => setForm({ ...form, landmark: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pincode" error={errorFor("pincode")}>
              <input className={input} inputMode="numeric" maxLength={6} autoComplete="postal-code" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, "") })} />
            </Field>
            <Field label="City / town" error={errorFor("city")}>
              <input className={input} autoComplete="address-level2" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
          </div>
          <Field label="State" error={errorFor("state")}>
            <select className={input} autoComplete="address-level1" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
              <option value="">Choose…</option>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="flex-1 rounded-full bg-foreground py-2.5 font-semibold text-background disabled:opacity-60">
              {busy ? "Saving…" : "Deliver here"}
            </button>
            {addresses && addresses.length > 0 && (
              <button type="button" onClick={() => setAdding(false)} className="rounded-full border border-line px-4">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <p role="alert" aria-live="polite" className="text-sm text-danger">
        {error}
      </p>
    </section>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {error && <span className="block text-danger">{error}</span>}
    </label>
  );
}
