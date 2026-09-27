import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import { envFlags } from "@/lib/env";
import { LEGAL_PAGES } from "@/lib/legal";
import { getAdminRole } from "@yolt/core";
import { db } from "@/lib/server/db";
import { getCurrentSeller, getCurrentUser } from "@/lib/server/session";
import { formatIndianMobile } from "@yolt/shared";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "YOLT — thrift, without the DMs", template: "%s · YOLT" },
  description: "One-of-one secondhand fashion from independent Indian thrift stores. Real measurements, honest flaws, safe checkout.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [user, seller] = await Promise.all([getCurrentUser(), getCurrentSeller()]);
  const isAdmin = user ? (await getAdminRole(db, user.userId)) !== null : false;
  return (
    <html lang="en-IN" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-10 border-b border-line bg-background/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="text-lg font-bold tracking-tight">
              YOLT
            </Link>
            {/* Plain GET form: search works before JavaScript loads. */}
            <form action="/search" method="get" role="search" className="mx-3 flex-1 sm:max-w-md">
              <input
                type="search"
                name="q"
                placeholder="Search jeans, Levi's, jackets…"
                aria-label="Search"
                className="w-full rounded-full border border-line bg-surface px-4 py-1.5 text-sm"
              />
            </form>
            <div className="flex items-center gap-3">
              {envFlags().devLogin && (
                <Link href="/dev" className="rounded-full border border-dashed border-line px-3 py-1 text-xs text-muted">
                  Dev: switch user
                </Link>
              )}
              {isAdmin && (
                <Link href="/admin" className="text-sm font-medium hover:underline">
                  Admin
                </Link>
              )}
              <AccountMenu phone={user?.phone ? formatIndianMobile(user.phone) : null} isSeller={seller !== null} />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-4">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-x-5 gap-y-2 px-4 py-6 text-xs text-muted">
            <span>Thrift without the DMs.</span>
            {LEGAL_PAGES.map((p) => (
              <Link key={p.href} href={p.href} className="hover:underline">
                {p.label}
              </Link>
            ))}
          </div>
        </footer>
      </body>
    </html>
  );
}
