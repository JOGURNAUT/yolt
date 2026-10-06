import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/seller/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatIST } from "@/lib/format";
import { getAuditLog } from "@/lib/server/admin-queries";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Audit log" };

const ACTIONS: Record<string, string> = {
  "claim.decided_refund": "Report decided: refund",
  "claim.decided_reject": "Report decided: rejected",
  "claim.accepted": "Seller accepted a report",
  "claim.disputed": "Seller disputed a report",
  "homepage_slot.created": "Homepage slot added",
  "homepage_slot.updated": "Homepage slot changed",
  "homepage_slot.deleted": "Homepage slot removed",
  "refund.marked_succeeded": "Refund recorded as issued",
  "refund.retry_requested": "Refund retried",
  "seller.onboarded": "Store onboarded",
  "seller.verify_kyc": "KYC verified",
  "seller.suspend": "Store suspended",
  "seller.reinstate": "Store reinstated",
  "seller_application.status_changed": "Application status changed",
};

const label = (action: string) => ACTIONS[action] ?? action.replace(/[._]/g, " ");

/** A snapshot as `key: value` pairs; long lists show their length. */
function summary(v: unknown): string | null {
  if (v === null || v === undefined || typeof v !== "object") return v == null ? null : String(v);
  const parts = Object.entries(v as Record<string, unknown>).map(([k, x]) => {
    const shown = Array.isArray(x) ? `${x.length} ${x.length === 1 ? "item" : "items"}` : x === null ? "none" : typeof x === "object" ? JSON.stringify(x) : String(x);
    return `${k}: ${shown}`;
  });
  return parts.length ? parts.join(", ") : null;
}

function who(e: { actorName: string | null; actorPhone: string | null; event: { actorRole: string } }) {
  const person = e.actorName ?? (e.actorPhone ? `…${e.actorPhone.slice(-4)}` : null);
  return { person, role: e.event.actorRole };
}

export default async function AdminAudit() {
  await connection();
  const { stale } = await requireAdmin();
  if (stale) return null;
  const rows = await getAuditLog(200);

  return (
    <>
      <PageHeader title="Audit log" kicker="Every staff, seller and system action that changes money, stores or orders. Newest first." size="h1" />
      {rows.length === 0 ? (
        <EmptyState tag="0" title="Nothing logged yet">
          Actions show up here the moment they happen.
        </EmptyState>
      ) : (
        <div className="sec !p-0 lg:!p-0">
          <div className="hidden gap-4 px-5 py-3 lg:grid lg:grid-cols-[130px_150px_minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)]" aria-hidden="true">
            {["When (IST)", "Who", "What", "Before → after", "Reason"].map((h) => (
              <span key={h} className="t-caption muted uppercase">
                {h}
              </span>
            ))}
          </div>
          <ul className="m-0 list-none divide-y divide-line p-0">
            {rows.map((r) => {
              const { person, role } = who(r);
              const before = summary(r.event.before);
              const after = summary(r.event.after);
              return (
                <li key={r.event.id} className="grid gap-x-4 gap-y-1 px-4 py-3 text-sm lg:grid-cols-[130px_150px_minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)] lg:px-5">
                  <span className="muted">{formatIST(r.event.createdAt)}</span>
                  <span>
                    <span className="sr-only">Who: </span>
                    <span className="font-semibold">{person ?? "System"}</span> <span className="muted">· {role}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="sr-only">What: </span>
                    <span className="font-semibold">{label(r.event.action)}</span>
                    <span className="muted block break-all font-mono text-xs">
                      {r.event.entity}/{r.event.entityId.slice(0, 8)}
                    </span>
                  </span>
                  <span className="min-w-0 break-words">
                    {before || after ? (
                      <>
                        {before && (
                          <span className="block">
                            <span className="muted">Before: </span>
                            {before}
                          </span>
                        )}
                        {after && (
                          <span className="block">
                            <span className="muted">After: </span>
                            {after}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="muted">No change recorded</span>
                    )}
                  </span>
                  <span className="min-w-0 break-words">
                    <span className="sr-only">Reason: </span>
                    {r.event.reason ?? <span className="muted">No reason (system action)</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
