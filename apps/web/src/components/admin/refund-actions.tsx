"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { adminRequest, type AdminResult } from "./admin-api";
import { AdminError, ReasonDialog } from "./admin-ui";

/** Retry a failed refund (with a reason) or record one issued in the payment provider's dashboard. */
export function RefundActions({ refundId, reference, failed }: { refundId: string; reference: string; failed: boolean }) {
  const router = useRouter();
  const inputId = useId();
  const [retrying, setRetrying] = useState(false);
  const [providerId, setProviderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Extract<AdminResult, { ok: false }> | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        {failed && (
          <Button variant="secondary" size="sm" className="!h-11 lg:!h-10" onClick={() => setRetrying(true)}>
            Retry
            <span className="sr-only"> refund for {reference}</span>
          </Button>
        )}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setFailure(null);
            const r = await adminRequest("POST", `/api/admin/refunds/${refundId}/succeeded`, { providerRefundId: providerId });
            setBusy(false);
            if (r.ok) router.refresh();
            else setFailure(r.error === "INVALID" ? { ...r, message: "Paste the provider's refund id (at least 4 characters)." } : r);
          }}
        >
          <div className="field">
            <label htmlFor={inputId} className="sr-only">
              Provider refund id for {reference}
            </label>
            <input id={inputId} className="input !h-11 !w-48 !text-sm" placeholder="Provider refund id" value={providerId} onChange={(e) => setProviderId(e.target.value)} />
          </div>
          <Button type="submit" variant="secondary" size="sm" className="!h-11 lg:!h-10" loading={busy}>
            Mark refunded
          </Button>
        </form>
      </div>
      <AdminError failure={failure} />
      <ReasonDialog
        open={retrying}
        onClose={() => setRetrying(false)}
        title={`Retry the refund for ${reference}`}
        intro="This queues the refund again. If the provider keeps failing it, issue it in their dashboard and record the refund id instead."
        confirmLabel="Retry refund"
        onSubmit={async (reason) => {
          const r = await adminRequest("POST", `/api/admin/refunds/${refundId}/retry`, { reason });
          if (r.ok) router.refresh();
          return r;
        }}
      />
    </div>
  );
}
