import type { Metadata } from "next";
import Link from "next/link";
import { ReauthButton } from "@/components/admin/admin-actions";
import { requireAdmin } from "@/lib/server/session";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { role, stale } = await requireAdmin();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <p className="font-semibold">
          YOLT admin <span className="ml-1 rounded bg-placeholder px-1.5 text-xs font-normal">{role}</span>
        </p>
        <nav className="flex flex-wrap gap-4 text-sm">
          <Link href="/admin" className="hover:underline">Overview</Link>
          <Link href="/admin/claims" className="hover:underline">Claims</Link>
          <Link href="/admin/sellers" className="hover:underline">Sellers</Link>
          <Link href="/admin/refunds" className="hover:underline">Refunds</Link>
          <Link href="/admin/audit" className="hover:underline">Audit log</Link>
        </nav>
      </div>
      {stale ? (
        <div className="space-y-3 rounded-lg border border-line bg-surface p-6 text-sm">
          <p className="font-medium">Your login is more than 12 hours old.</p>
          <p className="text-muted">Admin actions move money and change stores, so sign in again with your phone to continue.</p>
          <ReauthButton />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
