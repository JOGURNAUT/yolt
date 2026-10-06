import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { listClaimsForAdmin } from "@yolt/core";
import { ClaimDecision } from "@/components/admin/claim-decision";
import { ReadOnlyNote } from "@/components/admin/admin-ui";
import { PageHeader } from "@/components/seller/page-header";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { formatINR, formatIST } from "@/lib/format";
import { CLAIM_REASON_LABELS } from "@/lib/seller-format";
import { db } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Reports" };

const TABS = { ESCALATED: "Needs a decision", OPEN: "Waiting on seller", RESOLVED: "Resolved" } as const;
const CLAIM_BADGE: Record<string, { tone: BadgeTone; label: string }> = {
  ESCALATED: { tone: "reserved", label: "Needs a decision" },
  OPEN: { tone: "soon", label: "Waiting on seller" },
  REFUNDED: { tone: "available", label: "Refunded" },
  REJECTED: { tone: "danger", label: "Rejected" },
  WITHDRAWN: { tone: "removed", label: "Withdrawn by buyer" },
};

export default async function AdminClaims({ searchParams }: PageProps<"/admin/claims">) {
  await connection();
  const { stale, role } = await requireAdmin();
  if (stale) return null;
  const requested = (await searchParams).status;
  const status = typeof requested === "string" && requested in TABS ? (requested as keyof typeof TABS) : "ESCALATED";
  const rows = await listClaimsForAdmin(db, { status });

  return (
    <>
      <PageHeader title="Reports" kicker="Buyer protection: not as described, damaged, wrong item, never arrived" size="h1" />
      <nav aria-label="Report status" className="flex flex-wrap gap-2">
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map((t) => (
          <Link key={t} href={`/admin/claims?status=${t}`} scroll={false} aria-current={t === status ? "page" : undefined} className={cx("pill !no-underline", t === status && "is-active")}>
            {TABS[t]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 && (
        <EmptyState tag="0" title="Nothing here">
          {status === "ESCALATED" ? "Reports the seller disputes will wait here for a decision." : "No reports in this list."}
        </EmptyState>
      )}

      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {rows.map(({ claim, reference, totalPaise, sellerName, firstItem }) => {
          const badge = CLAIM_BADGE[claim.status] ?? { tone: "neutral" as const, label: claim.status };
          const decidable = claim.status === "ESCALATED" || claim.status === "OPEN";
          return (
            <li key={claim.id} className="sec" aria-label={`Report on order ${reference}`}>
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <h2 className="t-h2">{CLAIM_REASON_LABELS[claim.reason] ?? claim.reason}</h2>
                  <p className="t-small muted">
                    <span className="font-mono">{reference}</span> · {sellerName} · {formatINR(totalPaise)} · opened {formatIST(claim.createdAt)}
                  </p>
                </div>
                <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
              </div>

              {firstItem && (
                <div className="flex items-center gap-3">
                  {firstItem.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- order snapshot photo
                    <img src={firstItem.photoUrl} alt="" className="size-14 rounded-[10px] object-cover" />
                  )}
                  <p className="t-small">
                    <span className="muted">Item: </span>
                    {firstItem.title}
                  </p>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <section aria-label="Buyer's side" className="flex flex-col gap-2 rounded-xl bg-surface-2 p-4">
                  <h3 className="t-caption muted uppercase">Buyer says</h3>
                  <p className="t-body">“{claim.description}”</p>
                  {claim.photoUrls.length > 0 && (
                    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                      {claim.photoUrls.map((u, i) => (
                        <li key={u}>
                          <a href={u} target="_blank" rel="noopener" className="block" aria-label={`Open the buyer's photo ${i + 1} in a new tab`}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- evidence photo */}
                            <img src={u} alt={`Buyer's photo ${i + 1}`} className="size-24 rounded-[10px] object-cover" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {claim.photoUrls.length === 0 && <p className="t-small muted">No photos.</p>}
                </section>
                <section aria-label="Seller's side" className="flex flex-col gap-2 rounded-xl bg-surface-2 p-4">
                  <h3 className="t-caption muted uppercase">{sellerName} says</h3>
                  {claim.sellerResponse ? (
                    <>
                      <p className="t-body">“{claim.sellerResponse}”</p>
                      {claim.sellerRespondedAt && <p className="t-small muted">Replied {formatIST(claim.sellerRespondedAt)}</p>}
                    </>
                  ) : (
                    <p className="t-body muted">No reply yet.</p>
                  )}
                </section>
              </div>

              {decidable ? (
                role === "ADMIN" ? (
                  <ClaimDecision claimId={claim.id} amount={formatINR(totalPaise)} reference={reference} />
                ) : (
                  <ReadOnlyNote />
                )
              ) : (
                claim.resolvedAt && <p className="t-small muted">Resolved {formatIST(claim.resolvedAt)}. The reason is in the audit log.</p>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
