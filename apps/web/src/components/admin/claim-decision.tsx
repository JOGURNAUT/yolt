"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ICON_STROKE } from "@/components/ui/cx";
import { ConfirmDialog } from "@/components/seller/seller-dialog";
import { adminRequest, reasonOk, type AdminResult } from "./admin-api";
import { AdminError, REASON_ERROR, ReasonField } from "./admin-ui";

type Decision = "REFUND" | "REJECT";
type Done = { decision: Decision; refundId: string | null };

/**
 * YOLT's decision on an escalated report. The reason comes first (and is checked before anything
 * is asked), then a confirm step says what the decision does, then a done state replaces the form
 * until staff go back to the queue.
 */
export function ClaimDecision({ claimId, amount, reference }: { claimId: string; amount: string; reference: string }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Extract<AdminResult, { ok: false }> | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  function ask(decision: Decision) {
    setFailure(null);
    if (!reasonOk(reason)) {
      setReasonError(REASON_ERROR);
      box.current?.querySelector("textarea")?.focus();
      return;
    }
    setReasonError(null);
    setConfirm(decision);
  }

  async function submit() {
    if (!confirm) return;
    setBusy(true);
    const r = await adminRequest<{ refundId: string | null }>("POST", `/api/admin/claims/${claimId}/decide`, { decision: confirm, reason: reason.trim() });
    setBusy(false);
    const decision = confirm;
    setConfirm(null);
    if (r.ok) setDone({ decision, refundId: r.data.refundId });
    else setFailure(r);
  }

  if (done) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-xl bg-surface-2 p-4">
        <p className="t-body flex items-start gap-2 font-bold">
          <CircleCheck aria-hidden className="ic mt-0.5" strokeWidth={ICON_STROKE} />
          {done.decision === "REFUND" ? `Refund of ${amount} queued for the buyer.` : "Report rejected. No refund."}
        </p>
        <p className="t-small muted">
          {done.decision === "REFUND" ? (
            done.refundId ? (
              <>
                Issue it from <Link href="/admin/refunds" className="underline">Refunds</Link>. The decision and your reason are in the audit log.
              </>
            ) : (
              "No payment was found on this order, so there was nothing to refund. The decision and your reason are in the audit log."
            )
          ) : (
            "The decision and your reason are in the audit log."
          )}
        </p>
        <div>
          <Button variant="secondary" onClick={() => router.refresh()}>
            Back to the queue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={box} className="flex flex-col gap-3">
      <ReasonField
        value={reason}
        onChange={(v) => {
          setReason(v);
          if (reasonOk(v)) setReasonError(null);
        }}
        error={reasonError}
        label="Your decision, in your words"
        placeholder="What the evidence shows, and why you're deciding this way"
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" onClick={() => ask("REFUND")}>
          Refund buyer
        </Button>
        <Button size="lg" variant="secondary" onClick={() => ask("REJECT")}>
          Reject report
        </Button>
      </div>
      <AdminError failure={failure} />
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "REFUND" ? `Refund ${amount} to the buyer?` : "Reject this report?"}
        confirmLabel={confirm === "REFUND" ? "Refund buyer" : "Reject report"}
        tone={confirm === "REFUND" ? "primary" : "danger"}
        busy={busy}
        onConfirm={submit}
      >
        <p>
          {confirm === "REFUND"
            ? `This queues a full refund for order ${reference} and closes the report. It can't be undone.`
            : `This closes the report on order ${reference} with no refund. It can't be undone.`}
        </p>
        <p className="mt-3 rounded-xl bg-surface-2 p-3 text-foreground">
          <strong>Your reason:</strong> {reason.trim()}
        </p>
      </ConfirmDialog>
    </div>
  );
}
