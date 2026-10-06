"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, Plus, Truck } from "lucide-react";
import { formatIndianMobile, INDIAN_STATES, isValidPincode, validateAddress, type AddressError, type AddressInput } from "@yolt/shared";
import { useShop } from "./shop-state";
import { Button } from "./ui/button";
import { cx, ICON_STROKE } from "./ui/cx";
import { StatusBadge } from "./ui/status-badge";

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

const EMPTY: AddressInput = { name: "", phone: "", line1: "", line2: "", landmark: "", city: "", state: "", pincode: "" };

const SET_ERRORS: Record<string, string> = {
  NOT_SERVICEABLE: "Couriers can't deliver to this pincode yet. Choose another address.",
  PAYMENT_IN_PROGRESS: "Payment has started, so the address can't be changed now.",
  SELLER_PICKUP_UNKNOWN: "This store hasn't set a pickup location yet, so we can't ship this order.",
  SHIPPING_UNAVAILABLE: "Delivery checks are unavailable right now. Try again in a minute.",
};

type Serviceability = { pincode: string; ok: boolean; eta?: string } | null;

/** "Delivers to 411001 in 3–5 days", checked as soon as there are six digits. A failed check never blocks: the server checks again. */
function useServiceability(listingId: string, pincode: string): { state: "idle" | "checking" | "ok" | "no"; eta?: string } {
  const [result, setResult] = useState<Serviceability>(null);
  const valid = isValidPincode(pincode);
  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    void fetch(`/api/shipping/check?listingId=${listingId}&pincode=${pincode}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { serviceable: boolean; etaDaysMin?: number; etaDaysMax?: number } | null) => {
        if (cancelled || !b) return;
        setResult({ pincode, ok: b.serviceable, eta: b.serviceable ? `${b.etaDaysMin}–${b.etaDaysMax} days` : undefined });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [listingId, pincode, valid]);
  if (!valid) return { state: "idle" };
  if (result?.pincode !== pincode) return { state: "checking" };
  return result.ok ? { state: "ok", eta: result.eta } : { state: "no" };
}

function ServiceLine({ pincode, check, listingId }: { pincode: string; check: ReturnType<typeof useServiceability>; listingId: string }) {
  const { isSaved, toggleSave } = useShop();
  if (check.state === "idle") return null;
  if (check.state === "checking") return <p className="t-small muted" role="status">Checking delivery to {pincode}…</p>;
  if (check.state === "ok") {
    return (
      <p role="status" className="t-small flex items-start gap-1.5 font-semibold text-success">
        <Truck aria-hidden className="ic ic-16 mt-0.5 shrink-0" strokeWidth={ICON_STROKE} />
        Delivers to {pincode} in {check.eta} after dispatch.
      </p>
    );
  }
  return (
    <div role="alert" className="flex flex-col gap-1.5 rounded-md bg-surface-2 px-3.5 py-3">
      <p className="t-small flex items-start gap-1.5 font-bold">
        <CircleAlert aria-hidden className="ic ic-16 mt-0.5 shrink-0 text-danger" strokeWidth={ICON_STROKE} />
        We can&apos;t deliver to this pincode yet.
      </p>
      <p className="t-small muted">Try another address, or save this piece and come back later.</p>
      <button type="button" onClick={() => void toggleSave(listingId)} className="btn btn-sm btn-ghost !h-11 self-start !p-0">
        {isSaved(listingId) ? "Saved for later" : "Save for later"}
      </button>
    </div>
  );
}

/**
 * Checkout step 1: pick or add a delivery address. The server checks the pincode is deliverable
 * before attaching it to the order; payment is refused without one.
 */
export function AddressStep({
  orderId,
  listingId,
  currentPincode,
  onChosen,
  onCancel,
}: {
  orderId: string;
  listingId: string;
  /** The pincode of the address already on the order, to preselect it when changing. */
  currentPincode: string | null;
  onChosen: (eta: string | null) => void;
  onCancel?: () => void;
}) {
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<AddressInput>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<AddressError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/addresses", { cache: "no-store" });
    if (!res.ok) return;
    const list = (await res.json()) as Address[];
    setAddresses(list);
    setSelected((cur) => cur ?? (list.find((a) => a.pincode === currentPincode) ?? list.find((a) => a.isDefault) ?? list[0])?.id ?? null);
    if (list.length === 0) setAdding(true);
  }, [currentPincode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; state is set after the await
    void load();
  }, [load]);

  const picked = addresses?.find((a) => a.id === selected);
  const listCheck = useServiceability(listingId, adding ? "" : (picked?.pincode ?? ""));
  const formCheck = useServiceability(listingId, adding ? form.pincode : "");

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
    onChosen(`Delivers in ${body.etaDaysMin}–${body.etaDaysMax} days after dispatch.`);
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

  return (
    <section aria-labelledby="addr-h" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="addr-h" className="t-h2">
          {adding && addresses && addresses.length > 0 ? "New address" : "Deliver to"}
        </h2>
        {onCancel && !adding && (
          <button type="button" onClick={onCancel} className="btn btn-sm btn-ghost !h-11 !p-0">
            Cancel
          </button>
        )}
      </div>

      {addresses && addresses.length > 0 && !adding && (
        <>
          <div role="radiogroup" aria-labelledby="addr-h" className="grid gap-2.5 lg:grid-cols-2">
            {addresses.map((a) => (
              <label key={a.id} className="opt">
                <input type="radio" name="address" value={a.id} checked={selected === a.id} onChange={() => setSelected(a.id)} disabled={busy} />
                <span className="radio" aria-hidden="true" />
                <span className="flex min-w-0 grow flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="t-h3 !text-[15px]">{a.name}</span>
                    {a.isDefault && <StatusBadge tone="neutral">Default</StatusBadge>}
                  </span>
                  <span className="t-small">
                    {[a.line1, a.line2, a.landmark].filter(Boolean).join(", ")}, {a.city}, {a.state} {a.pincode}
                  </span>
                  <span className="t-small muted">{formatIndianMobile(a.phone)}</span>
                </span>
              </label>
            ))}
          </div>
          <Button variant="secondary" onClick={() => setAdding(true)} className="self-start">
            <Plus aria-hidden className="ic" strokeWidth={ICON_STROKE} />
            Add new address
          </Button>
          {picked && <ServiceLine pincode={picked.pincode} check={listCheck} listingId={listingId} />}
          <Button size="lg" block loading={busy} disabled={!selected || listCheck.state === "no"} onClick={() => selected && choose(selected)}>
            Continue to payment
          </Button>
        </>
      )}

      {adding && (
        <form onSubmit={save} className="flex flex-col gap-3.5" noValidate>
          <Field label="Full name" error={errorFor("name")}>
            <input className="input" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Mobile number (for the courier)" error={errorFor("phone")}>
            <input className="input" type="tel" inputMode="numeric" autoComplete="tel-national" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Flat / house no., building, street" error={errorFor("line1")}>
            <input className="input" autoComplete="address-line1" value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} />
          </Field>
          <Field label="Area, locality (optional)" error={errorFor("line2")}>
            <input className="input" autoComplete="address-line2" value={form.line2 ?? ""} onChange={(e) => setForm({ ...form, line2: e.target.value })} />
          </Field>
          <Field label="Landmark (optional)" error={errorFor("landmark")}>
            <input className="input" placeholder="Near…" value={form.landmark ?? ""} onChange={(e) => setForm({ ...form, landmark: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pincode" error={errorFor("pincode")}>
              <input
                className="input"
                inputMode="numeric"
                maxLength={6}
                autoComplete="postal-code"
                value={form.pincode}
                aria-invalid={formCheck.state === "no" || errorFor("pincode") ? true : undefined}
                onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, "") })}
              />
            </Field>
            <Field label="City / town" error={errorFor("city")}>
              <input className="input" autoComplete="address-level2" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
          </div>
          <ServiceLine pincode={form.pincode} check={formCheck} listingId={listingId} />
          <Field label="State" error={errorFor("state")}>
            <select className="input" autoComplete="address-level1" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
              <option value="">Choose…</option>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="lg" loading={busy} disabled={formCheck.state === "no"} className="flex-1">
              Deliver here
            </Button>
            {addresses && addresses.length > 0 && (
              <Button variant="secondary" size="lg" onClick={() => (setAdding(false), setError(null))}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}

      <p role="alert" aria-live="polite" className={cx("help err", !error && "hidden")}>
        {error}
      </p>
    </section>
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
