import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "YOLT — thrift, without the DMs", template: "%s · YOLT" },
  description: "One-of-one secondhand fashion from independent Indian thrift stores. Real measurements, honest flaws, safe checkout.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-10 border-b border-line bg-background/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="text-lg font-bold tracking-tight">
              YOLT
            </Link>
            {process.env.NODE_ENV !== "production" && (
              <Link href="/dev" className="rounded-full border border-dashed border-line px-3 py-1 text-xs text-muted">
                Dev: switch user
              </Link>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-4">{children}</main>
      </body>
    </html>
  );
}
