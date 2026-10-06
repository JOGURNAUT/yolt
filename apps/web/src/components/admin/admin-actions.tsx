"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { INDIAN_STATES } from "@yolt/shared";

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
export function SellerStatusActions({ sellerId, status, kycStatus }: { sellerId: string; status: string; kycStatus: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function act(action: "VERIFY_KYC" | "SUSPEND" | "REINSTATE", prompt: string) {
    const reason = window.prompt(prompt);
    if (reason === null) return;
    const r = await post(`/api/admin/sellers/${sellerId}/status`, { action, reason });
    if (r.ok) router.refresh();
    else setError(message(r.data.error));
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {kycStatus !== "VERIFIED" && (
        <button type="button" onClick={() => act("VERIFY_KYC", "How did you verify PAN and bank?")} className="rounded-full border border-line px-3 py-1">
          Mark KYC verified
        </button>
      )}
      {status === "APPROVED" ? (
        <button type="button" onClick={() => act("SUSPEND", "Why suspend this store? Its items disappear and can't be bought.")} className="rounded-full border border-danger px-3 py-1 text-danger">
          Suspend
        </button>
      ) : (
        <button type="button" onClick={() => act("REINSTATE", "Why reinstate this store?")} className="rounded-full border border-line px-3 py-1">
          Reinstate
        </button>
      )}
      {error && <span role="alert" className="text-danger">{error}</span>}
    </div>
  );
}

/** Pilot onboarding of an invited store. */
export function OnboardSellerForm() {
  const router = useRouter();
  const [form, setForm] = useState({ phone: "", handle: "", displayName: "", instagramHandle: "", pickupPincode: "", pickupState: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = "w-full rounded-md border border-line bg-background px-2 py-1.5 text-sm";
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <form
      className="grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await post("/api/admin/sellers", form);
        setBusy(false);
        if (r.ok) {
          setForm({ phone: "", handle: "", displayName: "", instagramHandle: "", pickupPincode: "", pickupState: "" });
          router.refresh();
        } else setError(message(r.data.error, r.data.details?.field));
      }}
    >
      <label className="space-y-1 text-sm">Owner&apos;s mobile<input className={field} required value={form.phone} onChange={set("phone")} /></label>
      <label className="space-y-1 text-sm">Store name<input className={field} required value={form.displayName} onChange={set("displayName")} /></label>
      <label className="space-y-1 text-sm">Handle (yolt.in/s/…)<input className={field} required value={form.handle} onChange={set("handle")} /></label>
      <label className="space-y-1 text-sm">Instagram (optional)<input className={field} value={form.instagramHandle} onChange={set("instagramHandle")} /></label>
      <label className="space-y-1 text-sm">Pickup pincode<input className={field} required inputMode="numeric" value={form.pickupPincode} onChange={set("pickupPincode")} /></label>
      <label className="space-y-1 text-sm">
        Pickup state
        <select className={field} required value={form.pickupState} onChange={set("pickupState")}>
          <option value="">Choose…</option>
          {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-60">
          {busy ? "Creating…" : "Create store (KYC pending)"}
        </button>
        {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
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
