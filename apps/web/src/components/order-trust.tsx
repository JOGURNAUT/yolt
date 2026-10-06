"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EvidencePhotos } from "./evidence-photos";

const REASONS = [
  { value: "NOT_AS_DESCRIBED", label: "Not as described (undisclosed flaw, different condition)" },
  { value: "DAMAGED", label: "Arrived damaged" },
  { value: "WRONG_ITEM", label: "Wrong item" },
  { value: "NOT_RECEIVED", label: "Never arrived" },
] as const;

const CLAIM_STATUS: Record<string, string> = {
  OPEN: "Waiting for the seller to respond.",
  ESCALATED: "The seller disputed this. YOLT is reviewing both sides and will decide.",
  REFUNDED: "Resolved: you've been refunded in full.",
  REJECTED: "Resolved without a refund after review.",
  WITHDRAWN: "You withdrew this report.",
};

const CLAIM_ERRORS: Record<string, string> = {
  EVIDENCE_REQUIRED: "Add at least one photo showing the problem.",
  WINDOW_CLOSED: "The 48-hour window for reporting a problem has closed.",
  TOO_EARLY: "You can report a missing parcel 10 days after it shipped.",
  ALREADY_CLAIMED: "You've already reported a problem with this order.",
  NOT_ELIGIBLE: "This order can't take a report right now.",
};

type Claim = { id: string; status: string; reason: string; description: string; sellerResponse: string | null } | null;

/** Buyer order page: report a problem, or see the claim's progress. */
export function ClaimSection({
  orderId,
  claim,
  windowOpen,
  windowClosesAt,
  deliveredMode,
}: {
  orderId: string;
  claim: Claim;
  windowOpen: boolean;
  windowClosesAt: string | null;
  /** Delivered orders can claim any reason; shipped-but-late ones only "never arrived". */
  deliveredMode: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(deliveredMode ? "NOT_AS_DESCRIBED" : "NOT_RECEIVED");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (claim) {
    return (
      <section className="space-y-2 rounded-lg border border-line bg-surface p-4 text-sm">
        <h2 className="font-semibold">Problem reported</h2>
        <p>{CLAIM_STATUS[claim.status] ?? claim.status}</p>
        <p className="text-muted">You said: {claim.description}</p>
        {claim.sellerResponse && <p className="text-muted">Seller: {claim.sellerResponse}</p>}
        {(claim.status === "OPEN" || claim.status === "ESCALATED") && (
          <button
            type="button"
            className="text-sm underline"
            onClick={async () => {
              await fetch(`/api/claims/${claim.id}/withdraw`, { method: "POST" });
              router.refresh();
            }}
          >
            Withdraw (everything&apos;s fine now)
          </button>
        )}
      </section>
    );
  }
  if (!windowOpen) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/orders/${orderId}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason, description, photoUrls: photos }),
    });
    setBusy(false);
    if (res.ok) return router.refresh();
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(CLAIM_ERRORS[body.error ?? ""] ?? (body.error === "INVALID_REQUEST" ? "Describe the problem in at least 10 characters." : "Couldn't send the report."));
  }

  const reasons = deliveredMode ? REASONS : REASONS.filter((r) => r.value === "NOT_RECEIVED");
  const when = windowClosesAt
    ? new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(windowClosesAt))
    : null;

  return open ? (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-line p-4 text-sm">
      <h2 className="font-semibold">Report a problem</h2>
      <fieldset className="space-y-1">
        {reasons.map((r) => (
          <label key={r.value} className="flex items-center gap-2">
            <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
            {r.label}
          </label>
        ))}
      </fieldset>
      <label className="block space-y-1">
        <span className="font-medium">What&apos;s wrong?</span>
        <textarea className="w-full rounded-md border border-line bg-background px-3 py-2" minLength={10} maxLength={1000} required value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {reason !== "NOT_RECEIVED" && (
        <div className="space-y-1">
          <span className="font-medium">Photos of the problem (required)</span>
          <EvidencePhotos urls={photos} onChange={setPhotos} max={6} />
        </div>
      )}
      <p className="text-xs text-muted">No size returns on YOLT. The seller can refund you or dispute it, and YOLT decides disputes.</p>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-full bg-foreground px-4 py-2 font-semibold text-background disabled:opacity-60">
          {busy ? "Sending…" : "Send report"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-line px-4 py-2">
          Cancel
        </button>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
    </form>
  ) : (
    <p className="text-sm">
      Something wrong?{" "}
      <button type="button" onClick={() => setOpen(true)} className="underline">
        Report a problem
      </button>
      {when && <span className="text-muted"> (until {when} IST)</span>}
    </p>
  );
}

/** Buyer order page: review each delivered item once. */
export function ReviewForm({ orderItemId, title }: { orderItemId: string; title: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [accuracy, setAccuracy] = useState(0);
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setError("Choose a star rating.");
    setBusy(true);
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderItemId, rating, accuracyRating: accuracy || null, body: body || null, photoUrls: photos }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError("Couldn't save your review.");
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-line p-4 text-sm">
      <h2 className="font-semibold">Review {title}</h2>
      <Stars label="Overall" value={rating} onChange={setRating} />
      <Stars label="Matched the listing (photos, flaws, measurements)" value={accuracy} onChange={setAccuracy} />
      <textarea
        className="w-full rounded-md border border-line bg-background px-3 py-2"
        maxLength={1000}
        placeholder="How was the fit, the condition, the packing?"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <EvidencePhotos urls={photos} onChange={setPhotos} max={3} />
      <button type="submit" disabled={busy} className="rounded-full bg-foreground px-4 py-2 font-semibold text-background disabled:opacity-60">
        {busy ? "Posting…" : "Post review"}
      </button>
      {error && <p role="alert" className="text-danger">{error}</p>}
    </form>
  );
}

function Stars({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <fieldset>
      <legend className="mb-1">{label}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer text-2xl leading-none">
            <input type="radio" className="sr-only" name={label} checked={value === n} onChange={() => onChange(n)} />
            <span aria-hidden="true" className={n <= value ? "text-foreground" : "text-muted"}>
              {n <= value ? "★" : "☆"}
            </span>
            <span className="sr-only">{n} stars</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
