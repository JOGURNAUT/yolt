"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Clock, Info, Lock, Scale, Star, Undo2, X } from "lucide-react";
import { EvidencePhotos } from "./evidence-photos";
import { GarmentImage } from "./garment-image";
import { BottomSheet } from "./ui/bottom-sheet";
import { Button } from "./ui/button";
import { cx, ICON_STROKE } from "./ui/cx";
import { StatusBadge, type BadgeTone } from "./ui/status-badge";

const REASONS = [
  { value: "NOT_AS_DESCRIBED", label: "Not as described" },
  { value: "DAMAGED", label: "Arrived damaged" },
  { value: "WRONG_ITEM", label: "Wrong item" },
  { value: "NOT_RECEIVED", label: "Never arrived" },
] as const;

const REASON_LABEL: Record<string, string> = Object.fromEntries(REASONS.map((r) => [r.value, r.label]));

const CLAIM_ERRORS: Record<string, string> = {
  EVIDENCE_REQUIRED: "Add at least one photo showing the problem.",
  WINDOW_CLOSED: "The 48-hour window for reporting a problem has closed.",
  TOO_EARLY: "You can report a missing parcel 10 days after it shipped.",
  ALREADY_CLAIMED: "You've already reported a problem with this order.",
  NOT_ELIGIBLE: "This order can't take a report right now.",
};

const STATUS: Record<string, { tone: BadgeTone; badge: string; icon: typeof Check; line: string }> = {
  OPEN: { tone: "reserved", badge: "Open", icon: Clock, line: "Waiting for the seller to respond." },
  ESCALATED: { tone: "reserved", badge: "Escalated", icon: Scale, line: "The seller disputed this. YOLT is reviewing both sides and will decide." },
  REFUNDED: { tone: "available", badge: "Refunded", icon: Check, line: "Resolved: you've been refunded in full." },
  REJECTED: { tone: "danger", badge: "Rejected", icon: X, line: "Resolved without a refund after review." },
  WITHDRAWN: { tone: "neutral", badge: "Withdrawn", icon: Undo2, line: "You withdrew this report." },
};

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));

type Claim = {
  id: string;
  status: string;
  reason: string;
  description: string;
  sellerResponse: string | null;
  photoUrls?: string[];
  createdAt?: string;
} | null;

/** Buyer order page: report a problem (ClaimSheet), or see the claim's progress (ClaimStatus). */
export function ClaimSection({
  orderId,
  claim,
  windowOpen,
  windowClosesAt,
  deliveredMode,
  sellerName = "the seller",
  reference,
  firstItem,
}: {
  orderId: string;
  claim: Claim;
  windowOpen: boolean;
  windowClosesAt: string | null;
  /** Delivered orders can claim any reason; shipped-but-late ones only "never arrived". */
  deliveredMode: boolean;
  sellerName?: string;
  reference?: string;
  firstItem?: { title: string; photoUrl: string | null; category: string } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(deliveredMode ? "NOT_AS_DESCRIBED" : "NOT_RECEIVED");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (claim) {
    const s = STATUS[claim.status] ?? { tone: "neutral" as const, badge: claim.status, icon: Info, line: claim.status };
    const Icon = s.icon;
    const active = claim.status === "OPEN" || claim.status === "ESCALATED";
    return (
      <section aria-labelledby="claim-h" className="card flex flex-col gap-3 p-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 id="claim-h" className="t-caption muted !font-bold">
            YOUR REPORT · {(REASON_LABEL[claim.reason] ?? claim.reason).toUpperCase()}
          </h2>
          <StatusBadge tone={s.tone}>
            <Icon aria-hidden className="ic ic-14" strokeWidth={ICON_STROKE} />
            {s.badge}
          </StatusBadge>
        </div>
        <p className="t-h3 !text-[15px]" role="status">
          {s.line}
        </p>
        <p className="t-small">
          <span className="muted">You said: </span>
          {claim.description}
        </p>
        {claim.photoUrls && claim.photoUrls.length > 0 && (
          <div className="flex gap-1.5">
            {claim.photoUrls.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- evidence photo the buyer uploaded
              <img key={u} src={u} alt={`Your photo ${i + 1}`} className="size-12 rounded-sm object-cover" />
            ))}
          </div>
        )}
        {claim.sellerResponse && (
          <div className="rounded-md bg-surface-2 p-3">
            <p className="t-caption muted">REPLY FROM {sellerName.toUpperCase()}</p>
            <p className="t-small mt-1">{claim.sellerResponse}</p>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {active && (
            <Button
              variant="secondary"
              block
              onClick={async () => {
                await fetch(`/api/claims/${claim.id}/withdraw`, { method: "POST" });
                router.refresh();
              }}
            >
              Withdraw (everything&apos;s fine now)
            </Button>
          )}
          <Link href="/legal/buyer-protection" className="t-small self-center font-bold">
            How buyer protection works
          </Link>
        </div>
      </section>
    );
  }
  if (!windowOpen) {
    if (!deliveredMode) return null;
    return (
      <section className="card flex flex-col gap-2 p-4">
        <StatusBadge tone="neutral" className="self-start">
          <Lock aria-hidden className="ic ic-14" strokeWidth={ICON_STROKE} />
          Window closed
        </StatusBadge>
        <p className="t-h3 !text-[15px]">The 48 h window to report has passed.</p>
        <p className="t-small muted">This order is complete. If the parcel never arrived, contact the grievance officer.</p>
        <Link href="/legal/grievance" className="t-small font-bold">
          Contact YOLT
        </Link>
      </section>
    );
  }

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
    if (res.ok) {
      setOpen(false);
      return router.refresh();
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(CLAIM_ERRORS[body.error ?? ""] ?? (body.error === "INVALID_REQUEST" ? "Describe the problem in at least 10 characters." : "Couldn't send the report."));
  }

  const reasons = deliveredMode ? REASONS : REASONS.filter((r) => r.value === "NOT_RECEIVED");

  return (
    <>
      <section className="card flex flex-col gap-3 p-4 lg:p-5 shadow-[inset_0_0_0_2px_var(--foreground)]">
        {windowClosesAt && (
          <div className="flex items-start gap-2.5">
            <Clock aria-hidden className="ic mt-px shrink-0" strokeWidth={ICON_STROKE} />
            <div className="flex flex-col gap-0.5">
              <span className="t-small font-bold">Check it now. Report a problem within 48 h of delivery.</span>
              <span className="t-small muted">Until {when(windowClosesAt)} IST.</span>
            </div>
          </div>
        )}
        <Button variant="secondary" block onClick={() => setOpen(true)}>
          Report a problem
        </Button>
      </section>
      {open && (
        <BottomSheet title="Report a problem" onClose={() => setOpen(false)} description={firstItem ? `${firstItem.title}${reference ? ` · ${reference}` : ""}` : undefined}>
          <form onSubmit={submit} className="flex flex-col gap-5">
            {firstItem && (
              <div className="flex items-center gap-3">
                <span className="w-11 shrink-0">
                  <GarmentImage src={firstItem.photoUrl} alt="" category={firstItem.category} className="!rounded-sm" />
                </span>
                <span className="t-small muted">{sellerName}</span>
              </div>
            )}
            {windowClosesAt && (
              <p className="t-small flex items-center gap-2">
                <Clock aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />
                <span>
                  <strong>Until {when(windowClosesAt)} IST</strong> to report
                </span>
              </p>
            )}
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="t-h3 mb-2.5 p-0">What&apos;s wrong?</legend>
              {reasons.map((r) => (
                <label key={r.value} className="opt !items-center">
                  <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
                  <span className="radio" aria-hidden="true" />
                  <span className="t-body">{r.label}</span>
                </label>
              ))}
              <p className="t-small mt-1 flex items-start gap-2.5 rounded-md bg-surface-2 px-3.5 py-3">
                <Info aria-hidden className="ic ic-16 mt-px shrink-0" strokeWidth={ICON_STROKE} />
                <span>
                  <strong>Doesn&apos;t fit?</strong> That isn&apos;t covered. No size returns: check the measurements.
                </span>
              </p>
            </fieldset>
            <label className="field">
              <span id="wrong-label">What&apos;s wrong? Tell us what you found</span>
              <textarea
                className="input !h-24 resize-none !py-3 !leading-[1.45]"
                aria-labelledby="wrong-label"
                minLength={10}
                maxLength={1000}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <span className="help">Be specific. {sellerName} and YOLT both read this.</span>
            </label>
            {reason !== "NOT_RECEIVED" && (
              <div className="flex flex-col gap-2">
                <span className="t-small font-bold">Photos of the problem (required)</span>
                <EvidencePhotos urls={photos} onChange={setPhotos} max={6} />
                <span className="help">Show the problem and the parcel label. Location data is removed from photos.</span>
              </div>
            )}
            <section aria-labelledby="next-h" className="flex flex-col gap-2">
              <h3 id="next-h" className="t-h3">
                What happens next
              </h3>
              <ol className="t-small m-0 flex list-decimal flex-col gap-1.5 pl-5">
                <li>{sellerName} can accept and refund you, or reply with their side.</li>
                <li>If you don&apos;t agree, YOLT reviews both sides and decides.</li>
                <li>If it&apos;s upheld: a full refund of item and shipping, to how you paid.</li>
              </ol>
            </section>
            <p className="t-small muted">No size returns on YOLT. The seller can refund you or dispute it, and YOLT decides disputes.</p>
            <Button type="submit" size="lg" block loading={busy}>
              Send report
            </Button>
            {error && (
              <p role="alert" className="help err">
                {error}
              </p>
            )}
          </form>
        </BottomSheet>
      )}
    </>
  );
}

const WORDS = ["", "Poor", "Not great", "Okay", "Good", "Loved it"];

/** Buyer order page: review each delivered item once (board ReviewForm). */
export function ReviewForm({ orderItemId, title, sellerName = "the seller" }: { orderItemId: string; title: string; sellerName?: string }) {
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
    <form onSubmit={submit} className="card flex flex-col gap-5 p-4 lg:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="t-h3 !normal-case" style={{ fontFamily: "var(--font-body)", fontStretch: "100%", fontWeight: 700 }}>
          How was {title}?
        </h2>
        <span className="t-small muted">From {sellerName}</span>
      </div>
      <Stars label="Overall" value={rating} onChange={setRating} />
      <Stars label="Matched the listing (photos, flaws, measurements)" value={accuracy} onChange={setAccuracy} />
      <label className="field">
        <span>Tell other buyers (optional)</span>
        <textarea
          className="input !h-24 resize-none !py-3 !leading-[1.45]"
          maxLength={1000}
          placeholder="How was the fit, the condition, the packing?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <div className="flex flex-col gap-2">
        <span className="t-small font-bold">Photos (optional, up to 3)</span>
        <EvidencePhotos urls={photos} onChange={setPhotos} max={3} />
      </div>
      <p className="t-small muted">Your first name and the piece you bought show with your review on {sellerName}&apos;s page. Only buyers of this piece can review it.</p>
      <Button type="submit" size="lg" block loading={busy}>
        Post review
      </Button>
      {error && (
        <p role="alert" className="help err">
          {error}
        </p>
      )}
    </form>
  );
}

function Stars({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <fieldset className="m-0 flex flex-col gap-0.5 border-0 p-0">
      <legend className="t-small mb-1 p-0 font-bold">{label}</legend>
      <div className="flex items-center gap-2">
        <div className="stars-pick -ml-2.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={cx(n <= value && "is-on")}>
              <input type="radio" name={label} checked={value === n} onChange={() => onChange(n)} />
              <Star aria-hidden strokeWidth={ICON_STROKE} />
              <span className="sr-only">{n} stars</span>
            </label>
          ))}
        </div>
        <span className="t-small font-bold" aria-hidden="true">
          {WORDS[value]}
        </span>
      </div>
    </fieldset>
  );
}
