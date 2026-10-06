"use client";

import { useState } from "react";
import { APPLICATION_VOLUMES, APPLICATION_VOLUME_LABELS, normalizeIndianMobile, normalizeInstagramHandle } from "@yolt/shared";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Stamp } from "@/components/ui/stamp";

type Field = "storeName" | "instagramHandle" | "city" | "whatTheySell" | "piecesPerMonth" | "phone";

const FIELD_ERRORS: Record<Field, string> = {
  storeName: "Enter your store name (2 to 80 characters).",
  instagramHandle: "Enter your Instagram handle, like @yourstore.",
  city: "Enter the city you ship from.",
  whatTheySell: "Tell us what you sell (at least 5 characters).",
  piecesPerMonth: "Pick roughly how many pieces you sell a month.",
  phone: "Enter a 10-digit Indian mobile number.",
};

type Done = { existing: boolean } | "failed" | "limited";

/** Apply to sell (boards SellerJoin, SellerJoinDone, SellerJoinFailed). Staff onboard stores by hand. */
export function ApplyForm() {
  const [v, setV] = useState({ storeName: "", instagramHandle: "", city: "", whatTheySell: "", piecesPerMonth: "", phone: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  function check() {
    const e: Partial<Record<Field, string>> = {};
    const name = v.storeName.trim();
    if (name.length < 2 || name.length > 80) e.storeName = FIELD_ERRORS.storeName;
    if (!normalizeInstagramHandle(v.instagramHandle)) e.instagramHandle = FIELD_ERRORS.instagramHandle;
    if (v.city.trim().length < 2) e.city = FIELD_ERRORS.city;
    if (v.whatTheySell.trim().length < 5) e.whatTheySell = FIELD_ERRORS.whatTheySell;
    if (!v.piecesPerMonth) e.piecesPerMonth = FIELD_ERRORS.piecesPerMonth;
    if (!normalizeIndianMobile(v.phone)) e.phone = FIELD_ERRORS.phone;
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = check();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/seller-applications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
      const body = (await res.json().catch(() => ({}))) as { existing?: boolean; details?: { field?: Field } };
      if (res.ok) return setDone({ existing: Boolean(body.existing) });
      if (res.status === 400 && body.details?.field) return setErrors({ [body.details.field]: FIELD_ERRORS[body.details.field] });
      setDone(res.status === 429 ? "limited" : "failed");
    } catch {
      setDone("failed");
    } finally {
      setBusy(false);
    }
  }

  if (done && done !== "failed" && done !== "limited") {
    return (
      <div role="status" className="card flex flex-col items-center gap-3 p-8 text-center">
        <Stamp wobble>
          <span className="dot" aria-hidden="true" />
          {done.existing ? "Already received" : "Received"}
        </Stamp>
        <h2 className="t-h1">{done.existing ? "We already have your application." : "Thanks, we have your application."}</h2>
        <p className="t-body muted max-w-[420px]">We&apos;ll message you on WhatsApp within 1 working day. Nothing else to do for now.</p>
      </div>
    );
  }

  const err = (k: Field) => (errors[k] ? <span className="help err" id={`${k}-err`}>{errors[k]}</span> : null);
  const aria = (k: Field) => ({ "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `${k}-err` : undefined });

  return (
    <form onSubmit={submit} noValidate className="card flex flex-col gap-4 p-5 lg:p-7" aria-labelledby="apply-h">
      <h2 id="apply-h" className="t-h1">
        Apply to sell
      </h2>
      {(done === "failed" || done === "limited") && (
        <p role="alert" className="t-small rounded-xl p-3 font-semibold text-danger shadow-[inset_0_0_0_1.5px_var(--danger)]">
          {done === "limited" ? "Too many tries. Wait a little and apply again." : "We couldn't send your application. Check your connection and try again."}
        </p>
      )}
      <label className="field">
        Store name
        <input className="input" value={v.storeName} onChange={set("storeName")} autoComplete="organization" {...aria("storeName")} />
        {err("storeName")}
      </label>
      <label className="field">
        Instagram handle
        <input className="input" value={v.instagramHandle} onChange={set("instagramHandle")} placeholder="@yourstore" autoCapitalize="none" {...aria("instagramHandle")} />
        {err("instagramHandle")}
      </label>
      <label className="field">
        City you ship from
        <input className="input" value={v.city} onChange={set("city")} autoComplete="address-level2" {...aria("city")} />
        {err("city")}
      </label>
      <label className="field">
        What you sell
        <textarea className="input !h-auto min-h-24 !py-3 !leading-[1.4]" value={v.whatTheySell} onChange={set("whatTheySell")} maxLength={500} placeholder="Vintage denim, streetwear, saris…" {...aria("whatTheySell")} />
        {err("whatTheySell")}
      </label>
      <label className="field">
        Pieces you sell in a month
        <select className="input" value={v.piecesPerMonth} onChange={set("piecesPerMonth")} {...aria("piecesPerMonth")}>
          <option value="">Choose…</option>
          {APPLICATION_VOLUMES.map((k) => (
            <option key={k} value={k}>
              {APPLICATION_VOLUME_LABELS[k]}
            </option>
          ))}
        </select>
        {err("piecesPerMonth")}
      </label>
      <label className="field">
        Mobile number (WhatsApp)
        <div className={cx("phone", errors.phone && "is-error")}>
          <span className="cc">+91</span>
          <input inputMode="numeric" autoComplete="tel-national" value={v.phone} onChange={set("phone")} {...aria("phone")} />
        </div>
        {err("phone")}
      </label>
      <Button type="submit" size="lg" block loading={busy}>
        Send application
      </Button>
      <p className="help text-center">We&apos;ll only use your number to message you about your application.</p>
    </form>
  );
}
