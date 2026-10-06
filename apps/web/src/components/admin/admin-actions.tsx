"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { INDIAN_STATES } from "@yolt/shared";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { adminRequest, type AdminResult } from "./admin-api";
import { AdminError, ReasonDialog } from "./admin-ui";

type SellerAction = "VERIFY_KYC" | "SUSPEND" | "REINSTATE";

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string; details?: { field?: string } };
  return { ok: res.ok, data };
}

const ERRORS: Record<string, string> = {
  REASON_REQUIRED: "Write a reason (at least 5 characters). It goes in the audit log.",
  NOT_DECIDABLE: "This claim was already resolved.",
  READ_ONLY_ROLE: "Your role is read-only.",
  REAUTH_REQUIRED: "Sign in again to continue.",
  HANDLE_TAKEN: "That store handle is taken.",
  ALREADY_A_SELLER: "That phone number already has a store.",
  NO_CHANGE: "Nothing to change.",
};
const message = (e?: string, field?: string) => (e === "INVALID" && field ? `Check the ${field} field.` : ERRORS[e ?? ""] ?? "Something went wrong.");

/** Refund or reject a claim, with a reason for the audit log. */
export function DecideClaim({ claimId }: { claimId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function decide(decision: "REFUND" | "REJECT") {
    if (!window.confirm(decision === "REFUND" ? "Refund the buyer in full?" : "Reject this claim (no refund)?")) return;
    setBusy(true);
    const r = await post(`/api/admin/claims/${claimId}/decide`, { decision, reason });
    setBusy(false);
    if (r.ok) router.refresh();
    else setError(message(r.data.error));
  }
  return (
    <div className="space-y-2">
      <textarea className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm" placeholder="Reason for the decision (shown in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => decide("REFUND")} className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-60">
          Refund buyer
        </button>
        <button type="button" disabled={busy} onClick={() => decide("REJECT")} className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-60">
          Reject claim
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

/** Verify KYC / suspend / reinstate, each asking for a reason. */
export function SellerStatusActions({ sellerId, status, kycStatus, name }: { sellerId: string; status: string; kycStatus: string; name: string }) {
  const router = useRouter();
  const [action, setAction] = useState<SellerAction | null>(null);
  const copy = {
    VERIFY_KYC: { title: `Mark ${name} KYC verified`, intro: "Only after you've checked their PAN and bank details. Once verified they can publish pieces.", confirm: "Mark KYC verified", tone: "primary" as const },
    SUSPEND: { title: `Suspend ${name}`, intro: "Their pieces disappear from YOLT and can't be bought until you reinstate them.", confirm: "Suspend store", tone: "danger" as const },
    REINSTATE: { title: `Reinstate ${name}`, intro: "Their store and pieces come back.", confirm: "Reinstate store", tone: "primary" as const },
  };
  const open = (a: SellerAction, label: string, extra?: string) => (
    <Button variant="secondary" size="sm" className={cx("!h-11 lg:!h-10", extra)} onClick={() => setAction(a)}>
      {label}
      <span className="sr-only"> for {name}</span>
    </Button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {kycStatus !== "VERIFIED" && open("VERIFY_KYC", "Mark KYC verified")}
      {status === "APPROVED" ? open("SUSPEND", "Suspend", "!text-danger") : open("REINSTATE", "Reinstate")}
      <ReasonDialog
        open={action !== null}
        onClose={() => setAction(null)}
        title={action ? copy[action].title : ""}
        intro={action ? copy[action].intro : undefined}
        confirmLabel={action ? copy[action].confirm : "Confirm"}
        tone={action ? copy[action].tone : "primary"}
        onSubmit={async (reason) => {
          const r = await adminRequest("POST", `/api/admin/sellers/${sellerId}/status`, { action, reason });
          if (r.ok) router.refresh();
          return r;
        }}
      />
    </div>
  );
}

/** Pilot onboarding of an invited store. */
export function OnboardSellerForm() {
  const router = useRouter();
  const blank = { phone: "", handle: "", displayName: "", instagramHandle: "", pickupPincode: "", pickupState: "" };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Extract<AdminResult, { ok: false }> | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setFailure(null);
        setCreated(null);
        const r = await adminRequest("POST", "/api/admin/sellers", form);
        setBusy(false);
        if (r.ok) {
          setCreated(form.displayName);
          setForm(blank);
          router.refresh();
        } else setFailure(r);
      }}
    >
      <label className="field">Owner&apos;s mobile<input className="input" required inputMode="tel" autoComplete="off" value={form.phone} onChange={set("phone")} /></label>
      <label className="field">Store name<input className="input" required value={form.displayName} onChange={set("displayName")} /></label>
      <label className="field">Handle (yolt.in/s/…)<input className="input" required autoCapitalize="none" value={form.handle} onChange={set("handle")} /></label>
      <label className="field">Instagram (optional)<input className="input" autoCapitalize="none" value={form.instagramHandle} onChange={set("instagramHandle")} /></label>
      <label className="field">Pickup pincode<input className="input" required inputMode="numeric" value={form.pickupPincode} onChange={set("pickupPincode")} /></label>
      <label className="field">
        Pickup state
        <select className="input" required value={form.pickupState} onChange={set("pickupState")}>
          <option value="">Choose…</option>
          {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <div>
          <Button type="submit" size="lg" loading={busy}>Create store (KYC pending)</Button>
        </div>
        <AdminError failure={failure} />
        {created && <p role="status" className="t-small font-semibold">Created {created}. Mark KYC verified below once you have checked PAN and bank details.</p>}
      </div>
    </form>
  );
}

/** Record a refund issued in the payment provider's dashboard. */
export function MarkRefundDone({ refundId }: { refundId: string }) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await post(`/api/admin/refunds/${refundId}/succeeded`, { providerRefundId: id });
        if (r.ok) router.refresh();
        else setError(r.data.error === "INVALID" ? "Paste the provider's refund id." : message(r.data.error));
      }}
    >
      <input className="w-44 rounded-md border border-line bg-background px-2 py-1 text-xs" placeholder="Provider refund id" value={id} onChange={(e) => setId(e.target.value)} />
      <button type="submit" className="rounded-full border border-line px-3 py-1 text-xs">Mark refunded</button>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </form>
  );
}
