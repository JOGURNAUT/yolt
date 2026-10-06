"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, CircleDashed } from "lucide-react";
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
import { Button, ButtonLink } from "@/components/ui/button";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { HangTag } from "@/components/ui/hang-tag";
import { formatINR, formatIST } from "@/lib/format";
import { ListingStatusActions } from "./listing-actions";
import { PhotoManager, type Photo } from "./photo-manager";

type Listing = {
  id: string;
  status: string;
  slug: string;
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
  publishedAt: Date | string | null;
};

type Form = Omit<Listing, "id" | "status" | "slug" | "pricePaise" | "publishedAt"> & { price: string };

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
  storeName,
}: {
  initial: { listing: Listing; photos: Photo[] };
  kycVerified: boolean;
  storeName: string;
}) {
  const router = useRouter();
  const live = initial.listing.status === "AVAILABLE";
  const [form, setForm] = useState<Form>(() => toForm(initial.listing));
  const [photos, setPhotos] = useState<Photo[]>(initial.photos);
  const [save, setSave] = useState<SaveState>("saved");
  const [serverError, setServerError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const lastSaved = useRef(JSON.stringify(toPatch(toForm(initial.listing))));
  const listId = useId();

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
  const left = readiness.missing.length;
  const heading = readiness.ready ? "Ready to publish" : "Before you publish";
  const price = pricePaise(form.price);

  return (
    <div className="grid max-w-[1120px] items-start gap-5 pb-44 lg:grid-cols-[minmax(0,1fr)_320px] lg:pb-0">
      <div className="space-y-4">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="t-h1 min-w-0 grow">{live ? "Edit live listing" : form.title?.trim() || "New listing"}</h1>
          <span role="status" aria-live="polite" className={cx("t-small", save === "error" ? "font-bold text-danger" : "muted")}>
            {saveLabel}
          </span>
        </header>

        {live && (
          <p className="t-small rounded-xl bg-surface-2 p-3">
            <strong>This item is live, so it must stay complete.</strong> Changes to price, measurements or flaws show on your store as soon as you save them.
          </p>
        )}

        <Section title="Photos of this exact piece" hint="Show the front, back, the label, and every flaw up close.">
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
            <input className="input" value={form.title ?? ""} maxLength={120} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Category">
              <select className="input" value={form.category ?? ""} onChange={(e) => changeCategory(e.target.value || null)}>
                <option value="">Choose…</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Brand (optional)" hint={category?.authSensitive ? "Buyers will see this as declared by you, not authenticated." : "Shown as “declared by seller”."}>
              <input className="input" value={form.brandDeclared ?? ""} maxLength={60} onChange={(e) => set("brandDeclared", e.target.value)} />
            </Field>
          </div>
          {category && category.group !== "ACCESSORY" && category.group !== "BAG" && (
            <Field label="Size on the tag" hint="Exactly as printed, e.g. “M”, “W32 L32”, “UK 8”.">
              <input className="input" value={form.tagSize ?? ""} maxLength={30} onChange={(e) => set("tagSize", e.target.value)} />
            </Field>
          )}
        </Section>

        {category && category.measurements.length > 0 && (
          <Section title="Size & measurements" hint="Lay the item flat and measure in centimetres. Buyers compare these with their own clothes.">
            {category.measurements.some((k) => WIDTH_MEASUREMENTS.includes(k)) && (
              <fieldset className="m-0 flex min-w-0 flex-wrap gap-x-6 border-0 p-0">
                <legend className="t-small mb-1 p-0 font-bold">Chest, waist and hip were measured…</legend>
                {(["FLAT", "AROUND"] as const).map((b) => (
                  <label key={b} className="tick">
                    <input type="radio" name="basis" checked={form.measurements.basis === b} onChange={() => setMeasurement("basis", b)} />
                    {b === "FLAT" ? "Flat, across one side" : "All the way around"}
                  </label>
                ))}
              </fieldset>
            )}
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
              {category.measurements.map((key) => (
                <Field key={key} label={`${MEASUREMENT_LABELS[key]}${category.requiredMeasurements.includes(key) ? "" : " (optional)"}`}>
                  <div className="relative">
                    <input className="input !pr-11" inputMode="decimal" defaultValue={form.measurements[key] ?? ""} onChange={(e) => setMeasurement(key, e.target.value)} />
                    <span className="t-small muted pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2">cm</span>
                  </div>
                </Field>
              ))}
            </div>
          </Section>
        )}

        <Section title="Condition">
          <div role="radiogroup" aria-label="Condition" className="grid gap-2.5 sm:grid-cols-2">
            {CONDITIONS.map((c) => (
              <label key={c} className="choice">
                <input type="radio" name="condition" checked={form.condition === c} onChange={() => set("condition", c)} />
                <span className="radio" aria-hidden="true" />
                <span className="flex flex-col gap-0.5">
                  <span className="t-small font-bold">{CONDITION_INFO[c].label}</span>
                  <span className="t-small muted">{CONDITION_INFO[c].meaning}</span>
                </span>
              </label>
            ))}
          </div>
        </Section>

        <Section title="Flaws">
          <Field label="Flaws" hint="Stains, holes, pulls, fading, missing buttons, alterations. Add a close-up photo of each.">
            <textarea
              className="input !h-auto min-h-24 !py-3 !leading-[1.4]"
              value={form.flaws ?? ""}
              maxLength={1000}
              disabled={form.noFlawsConfirmed}
              onChange={(e) => set("flaws", e.target.value)}
            />
          </Field>
          <label className="tick">
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

        <Section title="Pricing" hint="No size returns on YOLT, which is why accurate measurements matter. Buyers are refunded if an item isn't as described.">
          <Field label="Price" className="max-w-52">
            <div className="phone">
              <span className="cc">₹</span>
              <input inputMode="numeric" value={form.price} onChange={(e) => set("price", e.target.value)} />
            </div>
          </Field>
          <p className="t-small muted">
            {price !== null && price > 0 ? `You receive ${formatINR(price)}. ` : ""}Commission ₹0 · Pilot: no commission. The buyer pays shipping separately.
          </p>
          <Field label="Description (optional)" hint="Fit notes, styling, story of the piece.">
            <textarea className="input !h-auto min-h-20 !py-3 !leading-[1.4]" value={form.description ?? ""} maxLength={2000} onChange={(e) => set("description", e.target.value)} />
          </Field>
        </Section>

        {live && (
          <Section title="This listing">
            <p className="t-small muted">{initial.listing.publishedAt ? `Live on your store since ${formatIST(initial.listing.publishedAt)}.` : "Live on your store."}</p>
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLink href={`/p/${initial.listing.slug}`} variant="secondary" className="!h-11">
                View on your store
              </ButtonLink>
              <ListingStatusActions listingId={initial.listing.id} title={form.title?.trim() || "this listing"} onDone={() => router.push("/seller/listings")} />
            </div>
          </Section>
        )}
      </div>

      <aside aria-label="Publishing" className="space-y-4 lg:sticky lg:top-24">
        <section aria-labelledby={`${listId}-h`} className={cx("publish", live && "is-live")}>
          <div className="flex items-center justify-between gap-3">
            <h2 id={`${listId}-h`} className="t-h3 !normal-case lg:!text-lg">
              {live ? (readiness.ready ? "Live on your store" : "Keep it complete") : heading}
            </h2>
            {!readiness.ready && (
              <button
                type="button"
                className="btn btn-sm btn-ghost !h-11 !px-0 lg:hidden"
                aria-expanded={drawer}
                aria-controls={`${listId}-list`}
                onClick={() => setDrawer((d) => !d)}
              >
                {left} {left === 1 ? "thing" : "things"} left
                {drawer ? <ChevronDown aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} /> : <ChevronUp aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />}
              </button>
            )}
          </div>
          {readiness.ready ? (
            <p className="t-small muted hidden lg:block">Everything buyers need is here.</p>
          ) : (
            <ul id={`${listId}-list`} className={cx("m-0 flex list-none flex-col gap-2.5 p-0", !drawer && "hidden lg:flex")}>
              {readiness.missing.map((m, i) => (
                <li key={i} className="t-small flex items-start gap-2.5">
                  <CircleDashed aria-hidden className="ic ic-16 mt-0.5" strokeWidth={ICON_STROKE} />
                  <span>{m.message}</span>
                </li>
              ))}
            </ul>
          )}
          {!kycVerified && !live && <p className="t-small text-danger">Finish PAN and bank verification before your first listing can go live.</p>}
          {serverError && (
            <p role="alert" className="t-small rounded-xl p-3 font-semibold text-danger shadow-[inset_0_0_0_1.5px_var(--danger)]">
              {serverError}
            </p>
          )}
          {live ? (
            <Button size="lg" block onClick={() => void persist()} disabled={save === "saved" || save === "saving"}>
              Save changes
            </Button>
          ) : (
            <Button size="lg" block onClick={publish} loading={publishing} disabled={!readiness.ready || !kycVerified}>
              {initial.listing.status === "WITHDRAWN" ? "Relist" : readiness.ready ? "Publish" : `Publish · ${left} ${left === 1 ? "thing" : "things"} left`}
            </Button>
          )}
          <p className="help hidden lg:block">{live ? "Edits show buyers right away." : "Items are checked against this list before going live. Your draft saves as you go."}</p>
        </section>

        <section aria-label="Buyer preview" className="card hidden flex-col gap-2.5 p-4 lg:flex">
          <span className="t-caption muted">BUYER PREVIEW</span>
          <div className="pc pointer-events-none">
            <div className="media">
              <div className="ph">
                <div className="shot">
                  {photos[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- seller preview of their own upload
                    <img src={photos[0].url} alt="" />
                  ) : (
                    <span className="t-caption muted uppercase">Add a front photo</span>
                  )}
                </div>
              </div>
              {price !== null && price > 0 && (
                <span className="tagpos">
                  <HangTag>{formatINR(price)}</HangTag>
                </span>
              )}
            </div>
            <span className="title">{form.title?.trim() || "Your title"}</span>
            <span className="meta">
              {[form.tagSize, form.condition ? CONDITION_INFO[form.condition as keyof typeof CONDITION_INFO]?.label : null, storeName].filter(Boolean).join(" · ")}
            </span>
          </div>
        </section>
      </aside>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="sec">
      <div className="space-y-1">
        <h2 id={id} className="t-h2">
          {title}
        </h2>
        {hint && <p className="t-small muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cx("field", className)}>
      <span>{label}</span>
      {children}
      {hint && <span className="help">{hint}</span>}
    </label>
  );
}
