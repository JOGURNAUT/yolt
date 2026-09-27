"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const REASON_LABELS: Record<string, string> = {
  NOT_AS_DESCRIBED: "Not as described",
  DAMAGED: "Arrived damaged",
  WRONG_ITEM: "Wrong item",
  NOT_RECEIVED: "Never arrived",
};

type Claim = { id: string; status: string; reason: string; description: string; photoUrls: string[]; sellerResponse: string | null };

/** Seller order page: the buyer's report, with Accept (full refund) or Dispute (YOLT decides). */
export function ClaimResponse({ claim }: { claim: Claim }) {
  const router = useRouter();
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function respond(action: "ACCEPT" | "DISPUTE") {
    if (action === "ACCEPT" && !window.confirm("Refund the buyer in full?")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/seller/claims/${claim.id}/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, response }),
    });
    setBusy(false);
    if (res.ok) return router.refresh();
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(body.error === "EXPLANATION_REQUIRED" ? "Explain your side (at least 10 characters) so YOLT can decide fairly." : "Couldn't respond. Try again.");
  }

  return (
    <section className="space-y-3 rounded-lg border-2 border-danger p-4 text-sm">
      <h2 className="font-semibold">Buyer reported a problem: {REASON_LABELS[claim.reason] ?? claim.reason}</h2>
      <p>{claim.description}</p>
      {claim.photoUrls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {claim.photoUrls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noopener">
              {/* eslint-disable-next-line @next/next/no-img-element -- evidence photo */}
              <img src={u} alt="Buyer's photo of the problem" className="size-24 rounded object-cover" />
            </a>
          ))}
        </div>
      )}
      {claim.status === "OPEN" ? (
        <>
          <textarea
            className="w-full rounded-md border border-line bg-background px-3 py-2"
            maxLength={1000}
            placeholder="Your reply to the buyer (required if you dispute)"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => respond("ACCEPT")} className="rounded-full bg-foreground px-4 py-2 font-semibold text-background disabled:opacity-60">
              Accept and refund
            </button>
            <button type="button" disabled={busy} onClick={() => respond("DISPUTE")} className="rounded-full border border-line px-4 py-2 disabled:opacity-60">
              Dispute
            </button>
          </div>
          {error && <p role="alert" className="text-danger">{error}</p>}
        </>
      ) : (
        <p className="text-muted">
          {claim.status === "REFUNDED" ? "You refunded the buyer." : claim.status === "ESCALATED" ? "You disputed this; YOLT is reviewing it." : `Status: ${claim.status}`}
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
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await fetch(`/api/seller/reviews/${reviewId}/reply`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reply }),
        });
        setBusy(false);
        if (res.ok) router.refresh();
      }}
    >
      <input className="flex-1 rounded-md border border-line bg-background px-3 py-2 text-sm" maxLength={500} required placeholder="Reply publicly (once)" value={reply} onChange={(e) => setReply(e.target.value)} />
      <button type="submit" disabled={busy} className="rounded-full border border-line px-4 text-sm disabled:opacity-60">
        Reply
      </button>
    </form>
  );
}
