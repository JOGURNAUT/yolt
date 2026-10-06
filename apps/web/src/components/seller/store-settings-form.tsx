"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { DISPATCH_DAYS_RANGE, INDIAN_STATES, MAX_BIO_LENGTH } from "@yolt/shared";
import { Button } from "@/components/ui/button";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { formatINR } from "@/lib/format";
import { StoreMark } from "./seller-nav";

type Settings = {
  handle: string;
  displayName: string;
  instagramHandle: string | null;
  instagramVerified: boolean;
  kycStatus: string;
  bio: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  dispatchDays: number;
  shippingFeePaise: number;
  freeShippingAbovePaise: number | null;
  pickup: { name: string | null; phone: string | null; line1: string | null; line2: string | null; landmark: string | null; city: string | null; state: string | null; pincode: string | null };
};

const rupees = (paise: number | null) => (paise === null ? "" : String(paise / 100));
const toPaise = (v: string) => {
  const n = Number(v.replace(/[,\s₹]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

const PICKUP_FIELDS = [
  ["name", "Contact name"],
  ["phone", "Contact mobile"],
  ["line1", "Flat / house no., building, street"],
  ["line2", "Area, locality (optional)"],
  ["landmark", "Landmark (optional)"],
  ["city", "City / town"],
  ["pincode", "Pincode"],
] as const;

/** Store settings (board StoreSettings): look, about, shipping and pickup. Saved with one button. */
export function StoreSettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [fee, setFee] = useState(rupees(initial.shippingFeePaise));
  const [free, setFree] = useState(rupees(initial.freeShippingAbovePaise));
  const [pk, setPk] = useState({
    name: initial.pickup.name ?? "",
    phone: initial.pickup.phone ?? "",
    line1: initial.pickup.line1 ?? "",
    line2: initial.pickup.line2 ?? "",
    landmark: initial.pickup.landmark ?? "",
    city: initial.pickup.city ?? "",
    state: initial.pickup.state ?? "",
    pincode: initial.pickup.pincode ?? "",
  });
  const [pickupEdited, setPickupEdited] = useState(false);
  const [bio, setBio] = useState(initial.bio ?? "");
  const [days, setDays] = useState(initial.dispatchDays);
  const [state, setState] = useState<"saved" | "dirty" | "saving">("saved");
  const [errors, setErrors] = useState<string[]>([]);
  const [imgError, setImgError] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  async function upload(kind: "logo" | "banner", file: File | undefined) {
    if (!file) return;
    setImgError(null);
    const form = new FormData();
    form.set("file", file);
    const res = await fetch(`/api/seller/store/${kind}`, { method: "POST", body: form });
    const body = (await res.json().catch(() => ({}))) as { url?: string; details?: string };
    if (res.ok && body.url) setS((x) => ({ ...x, [kind === "logo" ? "logoUrl" : "bannerUrl"]: body.url! }));
    else setImgError(body.details ?? "That image couldn't be used. Try a JPG or PNG.");
  }
  async function removeImage(kind: "logo" | "banner") {
    setImgError(null);
    const res = await fetch(`/api/seller/store/${kind}`, { method: "DELETE" });
    if (res.ok) setS((x) => ({ ...x, [kind === "logo" ? "logoUrl" : "bannerUrl"]: null }));
    else setImgError("Couldn't remove that image.");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const feePaise = toPaise(fee);
    const freePaise = free.trim() === "" ? null : toPaise(free);
    if (Number.isNaN(feePaise) || (freePaise !== null && Number.isNaN(freePaise))) return setErrors(["Enter shipping amounts as numbers."]);
    setState("saving");
    setErrors([]);
    // Only send the address when it was edited, so a half-filled one doesn't block saving the rest.
    const anyPickup = pickupEdited;
    const res = await fetch("/api/seller/store", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bio: bio.trim() || null,
        dispatchDays: days,
        shippingFeePaise: feePaise,
        freeShippingAbovePaise: freePaise,
        ...(anyPickup ? { pickup: { ...pk, line2: pk.line2 || null, landmark: pk.landmark || null } } : {}),
      }),
    });
    if (res.ok) return setState("saved");
    const body = (await res.json().catch(() => ({}))) as { details?: { errors?: { message: string }[] } };
    setErrors(body.details?.errors?.map((x) => x.message) ?? ["Couldn't save. Check your connection and try again."]);
    setState("dirty");
  }

  const feeP = toPaise(fee);
  const freeP = free.trim() === "" ? null : toPaise(free);
  const preview = { dispatchDays: days, shippingFeePaise: Number.isNaN(feeP) ? 0 : feeP, freeShippingAbovePaise: freeP === null || Number.isNaN(freeP) ? null : freeP };
  const touch = () => setState("dirty");

  return (
    <form onSubmit={save} className="grid max-w-[1120px] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <section aria-labelledby="look-h" className="sec">
          <h2 id="look-h" className="t-h2">
            Look
          </h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex flex-col items-start gap-1">
              <StoreMark store={{ name: s.displayName, logoUrl: s.logoUrl }} size={84} />
              <input ref={logoInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-label="Logo file" onChange={(e) => void upload("logo", e.target.files?.[0])} />
              <Button variant="ghost" size="sm" className="!h-11 !px-0" onClick={() => logoInput.current?.click()}>
                Change logo
              </Button>
              {s.logoUrl && (
                <Button variant="ghost" size="sm" className="!h-11 !px-0 !text-danger" onClick={() => removeImage("logo")}>
                  Remove logo
                </Button>
              )}
            </div>
            <div className="min-w-0 grow space-y-1">
              <div className="h-24 overflow-hidden rounded-2xl bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- seller's uploaded banner */}
                {s.bannerUrl && <img src={s.bannerUrl} alt="Banner" className="size-full object-cover" />}
              </div>
              <input ref={bannerInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-label="Banner file" onChange={(e) => void upload("banner", e.target.files?.[0])} />
              <div className="flex gap-3">
                <Button variant="ghost" size="sm" className="!h-11 !px-0" onClick={() => bannerInput.current?.click()}>
                  Change banner
                </Button>
                {s.bannerUrl && (
                  <Button variant="ghost" size="sm" className="!h-11 !px-0 !text-danger" onClick={() => removeImage("banner")}>
                    Remove banner
                  </Button>
                )}
              </div>
            </div>
          </div>
          <p className="help">Logo is cropped square, banner wide. Photo location data is removed.</p>
          <p role="alert" className={cx("t-small font-semibold text-danger", !imgError && "hidden")}>
            {imgError}
          </p>
        </section>

        <section aria-labelledby="about-h" className="sec">
          <h2 id="about-h" className="t-h2">
            About
          </h2>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className="field">
              Store name
              <input className="input" value={s.displayName} readOnly aria-readonly="true" />
              <span className="help">Staff change this for you.</span>
            </label>
            <label className="field">
              Store link
              <input className="input" value={`yolt.in/s/${s.handle}`} readOnly aria-readonly="true" />
            </label>
            <label className="field sm:col-span-2">
              Bio
              <textarea
                className="input !h-auto min-h-[72px] !py-3 !leading-[1.4]"
                maxLength={MAX_BIO_LENGTH}
                value={bio}
                onChange={(e) => {
                  setBio(e.target.value);
                  touch();
                }}
              />
              <span className="help">
                {bio.length} / {MAX_BIO_LENGTH}
              </span>
            </label>
            <label className="field sm:col-span-2">
              Instagram
              <input className="input" value={s.instagramHandle ? `@${s.instagramHandle}` : "Not set"} readOnly aria-readonly="true" />
              <span className="help">{s.instagramVerified ? "Verified by YOLT." : "Not verified yet."}</span>
            </label>
          </div>
        </section>

        <section aria-labelledby="ship-h" className="sec">
          <h2 id="ship-h" className="t-h2">
            Shipping
          </h2>
          <div className="grid gap-3.5 sm:grid-cols-3">
            <label className="field">
              Ships within
              <select
                className="input"
                value={days}
                onChange={(e) => {
                  setDays(Number(e.target.value));
                  touch();
                }}
              >
                {Array.from({ length: DISPATCH_DAYS_RANGE.max - DISPATCH_DAYS_RANGE.min + 1 }, (_, i) => DISPATCH_DAYS_RANGE.min + i).map((d) => (
                  <option key={d} value={d}>
                    {d} {d === 1 ? "day" : "days"}
                  </option>
                ))}
              </select>
              <span className="help">Miss it by 48 h and buyers can cancel.</span>
            </label>
            <label className="field">
              Shipping fee
              <div className="phone">
                <span className="cc">₹</span>
                <input
                  inputMode="numeric"
                  value={fee}
                  onChange={(e) => {
                    setFee(e.target.value);
                    touch();
                  }}
                />
              </div>
              <span className="help">Buyer pays this per order (₹0 to ₹500).</span>
            </label>
            <label className="field">
              Free shipping above
              <div className="phone">
                <span className="cc">₹</span>
                <input
                  inputMode="numeric"
                  value={free}
                  onChange={(e) => {
                    setFree(e.target.value);
                    touch();
                  }}
                />
              </div>
              <span className="help">Leave empty to always charge.</span>
            </label>
          </div>
        </section>

        <section aria-labelledby="pickup-h" className="sec">
          <h2 id="pickup-h" className="t-h2">
            Pickup address
          </h2>
          <div className="grid gap-3.5 sm:grid-cols-2">
            {PICKUP_FIELDS.map(([k, label]) => (
              <label key={k} className={cx("field", k === "line1" && "sm:col-span-2")}>
                {label}
                <input
                  className="input"
                  value={pk[k]}
                  onChange={(e) => {
                    setPk((p) => ({ ...p, [k]: e.target.value }));
                    setPickupEdited(true);
                    touch();
                  }}
                />
              </label>
            ))}
            <label className="field">
              State
              <select
                className="input"
                value={pk.state}
                onChange={(e) => {
                  setPk((p) => ({ ...p, state: e.target.value }));
                  setPickupEdited(true);
                  touch();
                }}
              >
                <option value="">Choose…</option>
                {INDIAN_STATES.map((st) => (
                  <option key={st}>{st}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="help">Couriers collect from here.</p>
        </section>

        <section aria-labelledby="id-h" className="sec">
          <h2 id="id-h" className="t-h2">
            Identity and payouts
          </h2>
          <p className="t-small flex items-center gap-2.5">
            <BadgeCheck aria-hidden className="ic ic-24" strokeWidth={ICON_STROKE} style={{ fill: "var(--accent)" }} />
            <span>
              <strong>{s.kycStatus === "VERIFIED" ? "Identity verified" : "Not verified yet"}</strong>
              <span className="muted block">{s.kycStatus === "VERIFIED" ? "PAN and bank checked by YOLT." : "YOLT staff finish this when they set up your store."}</span>
            </span>
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" loading={state === "saving"} disabled={state === "saved"}>
            Save changes
          </Button>
          <span role="status" aria-live="polite" className="t-small muted">
            {state === "saved" ? "All changes saved" : state === "saving" ? "Saving…" : "Unsaved changes"}
          </span>
        </div>
        {errors.length > 0 && (
          <ul role="alert" className="t-small m-0 list-none space-y-1 p-0 font-semibold text-danger">
            {errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </div>

      <aside aria-label="Store preview" className="card flex flex-col gap-3 p-4 lg:sticky lg:top-24">
        <span className="t-caption muted">PREVIEW</span>
        <div className="h-20 overflow-hidden rounded-xl bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- seller's uploaded banner */}
          {s.bannerUrl && <img src={s.bannerUrl} alt="" className="size-full object-cover" />}
        </div>
        <StoreMark store={{ name: s.displayName, logoUrl: s.logoUrl }} size={56} />
        <div className="flex flex-col gap-1.5">
          <span className="t-h2">{s.displayName}</span>
          {bio && <span className="t-small">{bio}</span>}
          <span className="t-small muted">Ships in {preview.dispatchDays} {preview.dispatchDays === 1 ? "day" : "days"} ·{" "}
            {preview.shippingFeePaise === 0 ? "Free shipping" : `Shipping ${formatINR(preview.shippingFeePaise)}${preview.freeShippingAbovePaise !== null ? `, free above ${formatINR(preview.freeShippingAbovePaise)}` : ""}`}</span>
        </div>
        <Link href={`/s/${s.handle}`} className="btn btn-sm btn-secondary !h-11 self-start">
          Preview store
        </Link>
      </aside>
    </form>
  );
}
