import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { listApplications, listSellersForAdmin } from "@yolt/core";
import { APPLICATION_VOLUME_LABELS, formatIndianMobile } from "@yolt/shared";
import { OnboardSellerForm, SellerStatusActions } from "@/components/admin/admin-actions";
import { ReadOnlyNote } from "@/components/admin/admin-ui";
import { ApplicationActions } from "@/components/admin/application-actions";
import { PageHeader } from "@/components/seller/page-header";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { formatIST } from "@/lib/format";
import { getApplicationCounts } from "@/lib/server/admin-queries";
import { db } from "@/lib/server/db";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: "Sellers" };

const TABS = { NEW: "New", CONTACTED: "Contacted", ONBOARDED: "Onboarded", REJECTED: "Rejected" } as const;
type Tab = keyof typeof TABS;
const APP_BADGE: Record<Tab, { tone: BadgeTone; label: string }> = {
  NEW: { tone: "reserved", label: "New" },
  CONTACTED: { tone: "soon", label: "Contacted" },
  ONBOARDED: { tone: "available", label: "Onboarded" },
  REJECTED: { tone: "removed", label: "Rejected" },
};

export default async function AdminSellers({ searchParams }: PageProps<"/admin/sellers">) {
  await connection();
  const { stale, role } = await requireAdmin();
  if (stale) return null;
  const requested = (await searchParams).applications;
  const tab: Tab = typeof requested === "string" && requested in TABS ? (requested as Tab) : "NEW";
  const [rows, applications, counts] = await Promise.all([listSellersForAdmin(db), listApplications(db, { status: tab }), getApplicationCounts()]);

  return (
    <>
      <PageHeader title="Sellers" kicker="Applications and stores" size="h1" />

      <section className="sec" aria-labelledby="applications">
        <div>
          <h2 id="applications" className="t-h2">
            Applications
          </h2>
          <p className="t-small muted mt-1">Stores that applied on Sell on YOLT. Call them, then onboard them below.</p>
        </div>
        <nav aria-label="Application status" className="flex flex-wrap gap-2">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <Link key={t} href={`/admin/sellers?applications=${t}`} scroll={false} aria-current={t === tab ? "page" : undefined} className={cx("pill !no-underline", t === tab && "is-active")}>
              {TABS[t]} <span className="n">{counts[t] ?? 0}</span>
            </Link>
          ))}
        </nav>
        {applications.length === 0 ? (
          <EmptyState tag="0" title={`No ${TABS[tab].toLowerCase()} applications`}>
            {tab === "NEW" ? "New applications from Sell on YOLT show up here." : "Nothing in this list."}
          </EmptyState>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {applications.map(({ application: a, accountName }) => (
              <li key={a.id} className="card flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <h3 className="t-h3">{a.storeName}</h3>
                    <p className="t-small muted">
                      <a href={`https://instagram.com/${a.instagramHandle}`} target="_blank" rel="noopener" className="underline">
                        @{a.instagramHandle}
                      </a>{" "}
                      · {a.city} · {formatIndianMobile(a.phone)}
                      {accountName && ` · account: ${accountName}`}
                    </p>
                  </div>
                  <StatusBadge tone={APP_BADGE[a.status].tone}>{APP_BADGE[a.status].label}</StatusBadge>
                </div>
                <p className="t-body">{a.whatTheySell}</p>
                <p className="t-small muted">
                  {APPLICATION_VOLUME_LABELS[a.piecesPerMonth]} · applied {formatIST(a.createdAt)}
                </p>
                {a.adminNote && (
                  <p className="t-small rounded-xl bg-surface-2 p-3">
                    <strong>Staff note:</strong> {a.adminNote}
                  </p>
                )}
                {role === "ADMIN" ? <ApplicationActions id={a.id} status={a.status} note={a.adminNote} storeName={a.storeName} /> : <ReadOnlyNote />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {role === "ADMIN" && (
        <section className="sec" aria-labelledby="onboard">
          <div>
            <h2 id="onboard" className="t-h2">
              Onboard an invited store
            </h2>
            <p className="t-small muted mt-1">The owner signs in with this phone number. Nothing can be published until you mark KYC verified.</p>
          </div>
          <OnboardSellerForm />
        </section>
      )}

      <section className="sec" aria-labelledby="stores">
        <h2 id="stores" className="t-h2">
          Stores ({rows.length})
        </h2>
        <ul className="m-0 list-none divide-y divide-line p-0">
          {rows.map(({ seller, phone, liveListings, openClaims }) => (
            <li key={seller.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-3">
              <div className="min-w-0">
                <Link href={`/s/${seller.handle}`} className="t-body font-bold hover:underline">
                  {seller.displayName}
                </Link>
                <span className="t-small muted">
                  {" "}
                  @{seller.handle}
                  {phone && ` · ${formatIndianMobile(phone)}`}
                </span>
                <p className="t-small muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusBadge tone={seller.status === "APPROVED" ? "available" : seller.status === "SUSPENDED" ? "danger" : "neutral"}>{seller.status.charAt(0) + seller.status.slice(1).toLowerCase()}</StatusBadge>
                  <StatusBadge tone={seller.kycStatus === "VERIFIED" ? "available" : "reserved"}>KYC {seller.kycStatus.toLowerCase()}</StatusBadge>
                  <span>
                    {liveListings} live · {openClaims} open reports
                  </span>
                </p>
              </div>
              {role === "ADMIN" && <SellerStatusActions sellerId={seller.id} status={seller.status} kycStatus={seller.kycStatus} name={seller.displayName} />}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
