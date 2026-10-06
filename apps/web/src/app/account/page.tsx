import type { Metadata } from "next";
import { Box, ChevronRight, FileText, Heart, CircleHelp, MapPin, Ruler, ShieldCheck, Store, Users } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { getAccount } from "@yolt/core";
import { formatIndianMobile } from "@yolt/shared";
import { NameEditor, NotificationsRow, SignOutActions } from "@/components/account/profile-actions";
import { ICON_STROKE } from "@/components/ui/cx";
import { db } from "@/lib/server/db";
import { getAccountCounts } from "@/lib/server/queries";
import { getCurrentUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };

type Row = { href: string; label: string; sub?: string; icon: typeof Box };

function RowList({ label, rows }: { label: string; rows: Row[] }) {
  return (
    <nav aria-label={label} className="card px-3 py-1">
      {rows.map((r) => (
        <Link key={r.href + r.label} href={r.href} className="flex min-h-14 items-center gap-3 border-b border-line px-1 !no-underline last:border-0" style={{ color: "inherit" }}>
          <r.icon aria-hidden className="ic" strokeWidth={ICON_STROKE} />
          <span className="flex grow flex-col gap-0.5">
            <span className="t-body font-semibold">{r.label}</span>
            {r.sub && <span className="t-small muted">{r.sub}</span>}
          </span>
          <ChevronRight aria-hidden className="ic" strokeWidth={ICON_STROKE} />
        </Link>
      ))}
    </nav>
  );
}

/** `/account` (boards Profile, AccountDesktop): who you are, your stuff, help, and sign out. */
export default async function AccountPage() {
  await connection();
  const user = (await getCurrentUser())!;
  const [account, counts] = await Promise.all([getAccount(db, user.userId), getAccountCounts(user.userId)]);
  const name = account?.name?.trim() || null;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  const yours: Row[] = [
    { href: "/orders", label: "Orders", sub: counts.onTheWay > 0 ? `${counts.onTheWay} on the way` : undefined, icon: Box },
    { href: "/account/addresses", label: "Addresses", sub: `${counts.addresses} saved`, icon: MapPin },
    { href: "/saved", label: "Saved", sub: plural(counts.saved, "piece", "pieces"), icon: Heart },
    { href: "/saved?tab=following", label: "Following", sub: plural(counts.following, "store", "stores"), icon: Users },
    { href: "/preferences", label: "My sizes", icon: Ruler },
  ];
  const more: Row[] = [
    account?.isSeller
      ? { href: "/seller", label: "Switch to seller workspace", icon: Store }
      : { href: "/sell", label: "Sell on YOLT", sub: account?.sellerStatus === "APPLIED" ? "Application under review" : undefined, icon: Store },
    { href: "/legal/buyer-protection", label: "Buyer protection", icon: ShieldCheck },
    { href: "/legal/grievance", label: "Help", sub: "Grievance officer and support", icon: CircleHelp },
    { href: "/legal/terms", label: "Terms and privacy", icon: FileText },
  ];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="t-display">Profile</h1>
      <div className="flex flex-wrap items-center gap-3.5">
        <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
          <span className="wordmark text-[22px]">{(name ?? "Y")[0]!.toUpperCase()}</span>
        </span>
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <span className="t-h1 break-words">{name ?? "Add your name"}</span>
          <span className="t-small muted">{account?.phone ? `${formatIndianMobile(account.phone)} · signed in with WhatsApp` : "Signed in"}</span>
        </div>
        <NameEditor name={name} />
      </div>
      <RowList label="Your stuff" rows={yours} />
      <RowList label="More" rows={more} />
      <NotificationsRow />
      <SignOutActions />
    </div>
  );
}
