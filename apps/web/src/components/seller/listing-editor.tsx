"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORIES,
  CONDITION_INFO,
  CONDITIONS,
  getCategory,
  MEASUREMENT_LABELS,
  publishReadiness,
  WIDTH_MEASUREMENTS,
  type MeasurementKey,
  type Measurements,
} from "@yolt/shared";
import { PhotoManager, type Photo } from "./photo-manager";

type Listing = {
  id: string;
  status: string;
  title: string | null;
  description: string | null;
  category: string | null;
  brandDeclared: string | null;
  tagSize: string | null;
  measurements: Measurements;
  condition: string | null;
  flaws: string | null;
  noFlawsConfirmed: boolean;
  pricePaise: number | null;
  sizeReturnsAllowed: boolean;
};

type Form = Omit<Listing, "id" | "status" | "pricePaise"> & { price: string };

const toForm = (l: Listing): Form => ({
  title: l.title,
  description: l.description,
  category: l.category,
  brandDeclared: l.brandDeclared,
  tagSize: l.tagSize,
  measurements: l.measurements ?? {},
  condition: l.condition,
  flaws: l.flaws,
  noFlawsConfirmed: l.noFlawsConfirmed,
  price: l.pricePaise !== null ? String(l.pricePaise / 100) : "",
  sizeReturnsAllowed: l.sizeReturnsAllowed,
});

const pricePaise = (price: string) => {
  const n = Number(price.replace(/[,\s₹]/g, ""));
  return price.trim() === "" || !Number.isFinite(n) ? null : Math.round(n * 100);
};

function toPatch(f: Form) {
  const { price, ...rest } = f;
  return { ...rest, pricePaise: pricePaise(price) };
}

type SaveState = "saved" | "pending" | "saving" | "error";

export function ListingEditor({
  initial,
  kycVerified,
}: {
  initial: { listing: Listing; photos: Photo[] };
  kycVerified: boolean;
}) {
  const router = useRouter();
  const live = initial.listing.status === "AVAILABLE";
  const [form, setForm] = useState<Form>(() => toForm(initial.listing));
  const [photos, setPhotos] = useState<Photo[]>(initial.photos);
  const [save, setSave] = useState<SaveState>("saved");
  const [serverError, setServerError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const lastSaved = useRef(JSON.stringify(toPatch(toForm(initial.listing))));

  const category = getCategory(form.category);
  const readiness = useMemo(
    () =>
      publishReadiness({
        ...form,
        pricePaise: pricePaise(form.price),
        photoKinds: photos.map((p) => p.kind),
      }),
    [form, photos],
  );

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSave("pending");
  };
  const setMeasurement = (key: MeasurementKey | "basis", value: string) => {
    setForm((f) => {
      const m = { ...f.measurements };
      if (key === "basis") {
        if (value === "FLAT" || value === "AROUND") m.basis = value;
        else delete m.basis;
      } else {
        const n = Number(value);
        if (value.trim() === "" || !Number.isFinite(n) || n <= 0) delete m[key];
        else m[key] = Math.round(n * 10) / 10;
      }
      return { ...f, measurements: m };
    });
    setSave("pending");
  };

  /** Switching category drops measurements that don't apply (e.g. chest on jeans), so buyers never see stale ones. */
  const changeCategory = (id: string | null) => {
    const next = getCategory(id);
    setForm((f) => {
      const m: Measurements = {};
      for (const key of next?.measurements ?? []) if (f.measurements[key] !== undefined) m[key] = f.measurements[key];
      if (next?.measurements.some((k) => WIDTH_MEASUREMENTS.includes(k)) && f.measurements.basis) m.basis = f.measurements.basis;
      return { ...f, category: id, measurements: m };
    });
    setSave("pending");
  };

  const persist = useCallback(async () => {
    const patch = toPatch(form);
    const body = JSON.stringify(patch);
    if (body === lastSaved.current) {
      setSave("saved");
      return true;
    }
    setSave("saving");
    const res = await fetch(`/api/seller/listings/${initial.listing.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body,
    });
    if (res.ok) {
      lastSaved.current = body;
      setSave("saved");
      setServerError(null);
      return true;
    }
    const err = (await res.json().catch(() => ({}))) as { error?: string; details?: { missing?: { message: string }[] } };
    setSave("error");
    setServerError(
      err.error === "WOULD_BREAK_LIVE_LISTING"
        ? `This item is live, so it must stay complete: ${err.details?.missing?.map((m) => m.message).join(" ")}`
        : err.error === "NOT_EDITABLE"
          ? "This item can't be edited right now (a buyer may be checking out)."
          : "Couldn't save. Check your connection and try again.",
    );
    return false;
  }, [form, initial.listing.id]);

  // Drafts autosave; live listings save explicitly because buyers see every change.
  useEffect(() => {
    if (live || save !== "pending") return;
    const t = setTimeout(() => void persist(), 800);
    return () => clearTimeout(t);
  }, [live, save, persist]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (save === "saved") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  async function publish() {
    setPublishing(true);
    if (!(await persist())) return setPublishing(false);
    const res = await fetch(`/api/seller/listings/${initial.listing.id}/publish`, { method: "POST" });
    if (res.ok) {
      const { slug } = (await res.json()) as { slug: string };
      router.push(`/p/${slug}`);
      return;
    }
    const err = (await res.json().catch(() => ({}))) as { error?: string; details?: { missing?: { message: string }[] } };
    setServerError(
      err.error === "SELLER_NOT_VERIFIED"
        ? "Finish PAN and bank verification before your first listing goes live."
        : err.error === "INCOMPLETE"
          ? `Still missing: ${err.details?.missing?.map((m) => m.message).join(" ")}`
          : "Couldn't publish. Try again.",
    );
    setPublishing(false);
  }

  const saveLabel = { saved: live ? "All changes saved" : "Saved", pending: live ? "Unsaved changes" : "Editing…", saving: "Saving…", error: "Not saved" }[save];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{live ? "Edit live listing" : form.title?.trim() || "New listing"}</h1>
          <span role="status" aria-live="polite" className={`text-sm ${save === "error" ? "text-danger" : "text-muted"}`}>
            {saveLabel}
          </span>
        </header>

        <Section title="Photos" hint="Real photos of this exact piece. Show the front, back, the label, and every flaw up close.">
          <PhotoManager
            listingId={initial.listing.id}
            photos={photos}
            onChange={setPhotos}
            requireBackAndLabel={category?.group === "CLOTHING"}
            requireFlaw={Boolean(form.flaws?.trim())}
          />
        </Section>

        <Section title="Basics">
          <Field label="Title" hint="What a buyer would search for, e.g. “Vintage Levi's 501 jeans”.">
            <input className={input} value={form.title ?? ""} maxLength={120} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <select className={input} value={form.category ?? ""} onChange={(e) => changeCategory(e.target.value || null)}>
                <option value="">Choose…</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Brand (optional)" hint={category?.authSensitive ? "Buyers will see this as declared by you, not authenticated." : undefined}>
              <input className={input} value={form.brandDeclared ?? ""} maxLength={60} onChange={(e) => set("brandDeclared", e.target.value)} />
            </Field>
          </div>
          {category && category.group !== "ACCESSORY" && category.group !== "BAG" && (
            <Field label="Size on the tag" hint="Exactly as printed, e.g. “M”, “W32 L32”, “UK 8”.">
              <input className={input} value={form.tagSize ?? ""} maxLength={30} onChange={(e) => set("tagSize", e.target.value)} />
            </Field>
          )}
        </Section>

        {category && category.measurements.length > 0 && (
          <Section title="Measurements" hint="Lay the item flat and measure in centimetres. Buyers compare these with their own clothes.">
            {category.measurements.some((k) => WIDTH_MEASUREMENTS.includes(k)) && (
              <fieldset className="flex flex-wrap gap-4 text-sm">
                <legend className="mb-2 font-medium">Chest, waist and hip were measured…</legend>
                {(["FLAT", "AROUND"] as const).map((b) => (
                  <label key={b} className="flex items-center gap-2">
                    <input type="radio" name="basis" checked={form.measurements.basis === b} onChange={() => setMeasurement("basis", b)} />
                    {b === "FLAT" ? "Flat, across one side" : "All the way around"}
                  </label>
                ))}
              </fieldset>
            )}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {category.measurements.map((key) => (
                <Field key={key} label={`${MEASUREMENT_LABELS[key]}${category.requiredMeasurements.includes(key) ? "" : " (optional)"}`}>
                  <div className="relative">
                    <input
                      className={`${input} pr-10`}
                      inputMode="decimal"
                      defaultValue={form.measurements[key] ?? ""}
                      onChange={(e) => setMeasurement(key, e.target.value)}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">cm</span>
                  </div>
                </Field>
              ))}
            </div>
          </Section>
        )}

        <Section title="Condition and flaws">
          <div className="grid gap-2 sm:grid-cols-2">
            {CONDITIONS.map((c) => (
              <label
                key={c}
                className={`cursor-pointer rounded-lg border p-3 text-sm ${form.condition === c ? "border-foreground" : "border-line"}`}
              >
                <input type="radio" name="condition" className="sr-only" checked={form.condition === c} onChange={() => set("condition", c)} />
                <span className="font-medium">{CONDITION_INFO[c].label}</span>
                <span className="block text-muted">{CONDITION_INFO[c].meaning}</span>
              </label>
            ))}
          </div>
          <Field label="Flaws" hint="Stains, holes, pulls, fading, missing buttons, alterations. Add a close-up photo of each.">
            <textarea
              className={`${input} min-h-24`}
              value={form.flaws ?? ""}
              maxLength={1000}
              disabled={form.noFlawsConfirmed}
              onChange={(e) => set("flaws", e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.noFlawsConfirmed}
              onChange={(e) => {
                set("noFlawsConfirmed", e.target.checked);
                if (e.target.checked) set("flaws", null);
              }}
            />
            No flaws — I checked the whole item
          </label>
        </Section>

        <Section title="Price and returns">
          <Field label="Price">
            <div className="relative max-w-48">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">₹</span>
              <input className={`${input} pl-7`} inputMode="numeric" value={form.price} onChange={(e) => set("price", e.target.value)} />
            </div>
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={form.sizeReturnsAllowed} onChange={(e) => set("sizeReturnsAllowed", e.target.checked)} />
            <span>
              Allow size returns
              <span className="block text-muted">Buyer can return within 48 hours if it doesn&apos;t fit (unworn, tags on). Returns for items not as described are always allowed.</span>
            </span>
          </label>
          <Field label="Description (optional)" hint="Fit notes, styling, story of the piece.">
            <textarea className={`${input} min-h-20`} value={form.description ?? ""} maxLength={2000} onChange={(e) => set("description", e.target.value)} />
          </Field>
        </Section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-lg border border-line bg-surface p-4">
          <h2 className="font-semibold">{readiness.ready ? "Ready to publish" : "Before you publish"}</h2>
          {readiness.ready ? (
            <p className="mt-1 text-sm text-muted">Everything buyers need is here.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {readiness.missing.map((m, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden="true" className="text-muted">○</span>
                  {m.message}
                </li>
              ))}
            </ul>
          )}
          {!kycVerified && (
            <p className="mt-3 text-sm text-danger">Finish PAN and bank verification before your first listing can go live.</p>
          )}
        </div>

        {serverError && (
          <p role="alert" className="rounded-md border border-danger p-3 text-sm text-danger">
            {serverError}
          </p>
        )}

        {live ? (
          <button type="button" onClick={() => void persist()} disabled={save === "saved" || save === "saving"} className={primary}>
            Save changes
          </button>
        ) : (
          <button type="button" onClick={publish} disabled={!readiness.ready || !kycVerified || publishing} className={primary}>
            {publishing ? "Publishing…" : initial.listing.status === "WITHDRAWN" ? "Relist" : "Publish"}
          </button>
        )}
      </aside>
    </div>
  );
}

const input = "w-full rounded-md border border-line bg-background px-3 py-2 text-base disabled:opacity-50";
const primary = "w-full rounded-full bg-foreground py-3 font-semibold text-background disabled:opacity-40";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}
