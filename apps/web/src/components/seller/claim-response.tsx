"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { StatusBadge } from "@/components/ui/status-badge";
import { CLAIM_REASON_LABELS } from "@/lib/seller-format";

type Claim = { id: string; status: string; reason: string; description: string; photoUrls: string[]; sellerResponse: string | null; reportedAt: string };

/** Seller order page: the buyer's report, with Accept (full refund) or Dispute (YOLT decides). */
export function ClaimResponse({ claim }: { claim: Claim }) {
  const router = useRouter();
  const replyId = useId();
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState<"ACCEPT" | "DISPUTE" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(action: "ACCEPT" | "DISPUTE") {
    if (action === "ACCEPT" && !window.confirm("Refund the buyer in full?")) return;
    setBusy(action);
    setError(null);
    const res = await fetch(`/api/seller/claims/${claim.id}/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, response }),
    });
    setBusy(null);
    if (res.ok) return router.refresh();
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(body.error === "EXPLANATION_REQUIRED" ? "Explain your side (at least 10 characters) so YOLT can decide fairly." : "Couldn't respond. Try again.");
  }

  const open = claim.status === "OPEN";
  return (
    <section aria-labelledby={`${replyId}-h`} className={cx("sec", open ? "is-danger" : "")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${replyId}-h`} className="t-h2">
          Buyer reported a problem: {CLAIM_REASON_LABELS[claim.reason] ?? claim.reason}
        </h2>
        <span className="t-small muted">Reported {claim.reportedAt}</span>
      </div>
      <p className="t-body">“{claim.description}”</p>
      {claim.photoUrls.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {claim.photoUrls.map((u, i) => (
            <li key={u}>
              <a href={u} target="_blank" rel="noopener" className="block" aria-label={`Open the buyer's photo ${i + 1} in a new tab`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- evidence photo */}
                <img src={u} alt="Buyer's photo of the problem" className="size-[88px] rounded-[10px] object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <>
          <label className="field">
            Your reply to the buyer
            <textarea
              className="input !h-auto min-h-24 !py-3 !leading-[1.4]"
              maxLength={1000}
              placeholder="Required if you dispute"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
            />
            <span className="help">The buyer and YOLT both see this. If you and the buyer disagree, YOLT decides.</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" loading={busy === "ACCEPT"} disabled={busy !== null} onClick={() => respond("ACCEPT")}>
              Accept and refund
            </Button>
            <Button size="lg" variant="secondary" loading={busy === "DISPUTE"} disabled={busy !== null} onClick={() => respond("DISPUTE")}>
              Dispute
            </Button>
          </div>
          <p role="alert" className={cx("t-small font-semibold text-danger", !error && "hidden")}>
            {error}
          </p>
        </>
      ) : (
        <p role="status" className="t-small flex flex-wrap items-center gap-2">
          <StatusBadge tone={claim.status === "REFUNDED" ? "available" : claim.status === "ESCALATED" ? "reserved" : "neutral"}>
            {claim.status === "REFUNDED" ? "Refunded" : claim.status === "ESCALATED" ? "With YOLT" : claim.status.charAt(0) + claim.status.slice(1).toLowerCase()}
          </StatusBadge>
          <span className="muted">
            {claim.status === "REFUNDED" ? "You refunded the buyer." : claim.status === "ESCALATED" ? "You disputed this; YOLT is reviewing it." : `Status: ${claim.status}`}
          </span>
        </p>
      )}
      {!open && claim.sellerResponse && (
        <p className="t-small rounded-xl bg-surface-2 p-3">
          <strong>Your reply:</strong> {claim.sellerResponse}
        </p>
      )}
    </section>
  );
}

/** Seller reviews page: reply once to a review. */
export function ReviewReply({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch(`/api/seller/reviews/${reviewId}/reply`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reply }),
        });
        setBusy(false);
        if (res.ok) router.refresh();
        else setError("Couldn't post your reply. Try again.");
      }}
    >
      <label className="field">
        Your reply
        <textarea className="input !h-auto min-h-[72px] !py-3 !leading-[1.4]" maxLength={500} required placeholder="Reply publicly (once)" value={reply} onChange={(e) => setReply(e.target.value)} />
        <span className="help">{reply.length} / 500 · shown under the review on your store</span>
      </label>
      <div>
        <Button type="submit" loading={busy}>
          Post reply
        </Button>
      </div>
      <p role="alert" className={cx("t-small font-semibold text-danger", !error && "hidden")}>
        {error}
      </p>
    </form>
  );
}
