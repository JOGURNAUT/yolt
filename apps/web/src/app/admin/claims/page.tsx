import Link from "next/link";
import { connection } from "next/server";
import { listClaimsForAdmin } from "@yolt/core";
import { DecideClaim } from "@/components/admin/admin-actions";
import { formatINR, formatIST } from "@/lib/format";
import { db } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/session";

const TABS = { ESCALATED: "Disputed", OPEN: "Waiting on seller", RESOLVED: "Resolved" } as const;
const REASONS: Record<string, string> = { NOT_AS_DESCRIBED: "Not as described", DAMAGED: "Damaged", WRONG_ITEM: "Wrong item", NOT_RECEIVED: "Never arrived" };

export default async function AdminClaims({ searchParams }: PageProps<"/admin/claims">) {
  await connection();
  const { stale, role } = await requireAdmin();
  if (stale) return null;
  const requested = (await searchParams).status;
  const status = typeof requested === "string" && requested in TABS ? (requested as keyof typeof TABS) : "ESCALATED";
  const rows = await listClaimsForAdmin(db, { status });

  return (
    <div className="space-y-4">
      <nav className="flex gap-2">
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map((t) => (
          <Link key={t} href={`/admin/claims?status=${t}`} aria-current={t === status ? "page" : undefined} className={`rounded-full border px-3 py-1.5 text-sm ${t === status ? "border-foreground bg-foreground text-background" : "border-line"}`}>
            {TABS[t]}
          </Link>
        ))}
      </nav>
      {rows.length === 0 && <p className="py-8 text-center text-sm text-muted">Nothing here.</p>}
      <ul className="space-y-4">
        {rows.map(({ claim, reference, totalPaise, sellerName, firstItem }) => (
          <li key={claim.id} className="space-y-3 rounded-lg border border-line bg-surface p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-semibold">{REASONS[claim.reason]} · {reference} · {sellerName}</p>
              <p className="text-muted">{formatINR(totalPaise)} · opened {formatIST(claim.createdAt)}</p>
            </div>
            <p className="text-muted">Item: {firstItem?.title}</p>
            <p><span className="font-medium">Buyer:</span> {claim.description}</p>
            {claim.photoUrls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {claim.photoUrls.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noopener">
                    {/* eslint-disable-next-line @next/next/no-img-element -- evidence */}
                    <img src={u} alt="Buyer's evidence" className="size-24 rounded object-cover" />
                  </a>
                ))}
              </div>
            )}
            {claim.sellerResponse && <p><span className="font-medium">Seller:</span> {claim.sellerResponse}</p>}
            {(claim.status === "ESCALATED" || claim.status === "OPEN") && role === "ADMIN" ? (
              <DecideClaim claimId={claim.id} />
            ) : (
              <p className="text-muted">Status: {claim.status}{claim.resolvedAt && ` · ${formatIST(claim.resolvedAt)}`}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
