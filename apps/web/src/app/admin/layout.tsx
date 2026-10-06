import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminNav } from "@/components/admin/admin-nav";
import { ReauthButton } from "@/components/admin/admin-ui";
import { getAdminDashboardCounts } from "@/lib/server/admin-queries";
import { requireAdmin } from "@/lib/server/session";
import "@/styles/seller.css";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await connection();
  const { role, stale } = await requireAdmin();
  const counts = stale ? null : await getAdminDashboardCounts();
  return (
    <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-4 lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-8">
      <AdminNav role={role} counts={{ sellers: counts?.new_applications ?? 0, reports: counts?.escalated_reports ?? 0, refunds: counts?.open_refunds ?? 0 }} />
      <div className="min-w-0 space-y-5">
        {stale ? (
          <section role="alert" className="sec is-emphasis">
            <h1 className="t-h2">Sign in again to make admin changes</h1>
            <p className="t-body muted">Your login is more than 12 hours old. Admin actions move money and change stores, so sign in again with your phone to continue.</p>
            <div>
              <ReauthButton />
            </div>
          </section>
        ) : (
          <>
            {role === "SUPPORT" && (
              <p role="note" className="t-small rounded-xl bg-surface-2 p-3">
                <strong>Read-only access.</strong> You can see everything here, but only an admin can change it.
              </p>
            )}
            {children}
          </>
        )}
      </div>
    </div>
  );
}
