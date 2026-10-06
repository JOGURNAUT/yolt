import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getSavedListings } from "@yolt/core";
import { GuestSaved } from "@/components/guest-lists";
import { FollowChip } from "@/components/landing/drop-clock";
import { ProductGrid } from "@/components/product-card";
import { initials, storeFacts } from "@/components/search/store-row";
import { ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { formatIST } from "@/lib/format";
import { db } from "@/lib/server/db";
import { getFollowedStoreRows } from "@/lib/server/queries";
import { getCurrentUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Saved", robots: { index: false } };

/** `/saved` (boards Saved, SavedDesktop, SavedEmpty, SavedStores): Pieces and Following tabs, kept in the URL. */
export default async function SavedPage({ searchParams }: PageProps<"/saved">) {
  await connection();
  const following = (await searchParams).tab === "following";
  const user = await getCurrentUser();

  const tabs = (counts: { pieces?: number; stores?: number }) => (
    <nav aria-label="Saved" className="seg flex w-full lg:w-auto">
      {(
        [
          ["Pieces", "/saved", !following, counts.pieces],
          ["Following", "/saved?tab=following", following, counts.stores],
        ] as const
      ).map(([label, href, on, n]) => (
        <Link key={label} href={href} aria-current={on ? "page" : undefined} className={cx("flex min-h-11 flex-1 items-center justify-center rounded-full px-[18px] text-[13px] font-bold !no-underline", on ? "bg-foreground text-background" : "text-muted")}>
          {label}
          {n !== undefined ? ` · ${n}` : ""}
        </Link>
      ))}
    </nav>
  );

  const head = (t: React.ReactNode) => (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <h1 className="t-display">Saved</h1>
      {t}
    </div>
  );

  if (!user) {
    return (
      <div className="flex flex-col gap-4">
        {head(null)}
        <p className="t-small muted">
          Saved on this device. <Link href="/login?next=/saved" className="font-bold">Sign in</Link> to keep them everywhere.
        </p>
        <GuestSaved />
      </div>
    );
  }

  const [items, stores] = await Promise.all([getSavedListings(db, user.userId), getFollowedStoreRows(user.userId)]);
  const counts = { pieces: items.length, stores: stores.length };

  if (!following) {
    return (
      <div className="flex flex-col gap-4">
        {head(tabs(counts))}
        {items.length > 0 ? (
          <>
            <p className="t-small muted">Saving doesn&apos;t hold a piece. We&apos;ll tell you on WhatsApp if one sells.</p>
            <ProductGrid items={items} showSeller />
          </>
        ) : (
          <EmptyState tag="Nothing saved" title="Save the ones you love." action={<ButtonLink href="/search">Start exploring</ButtonLink>}>
            Tap the heart on any piece to keep it here. We&apos;ll tell you if it sells.
          </EmptyState>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {head(tabs(counts))}
      {stores.length > 0 ? (
        <>
          <p className="t-small muted">You&apos;ll hear about new drops from stores you follow.</p>
          <ul className="grid gap-3 lg:grid-cols-2">
            {stores.map((s) => (
              <li key={s.id} className="card flex items-center gap-3 p-3.5">
                <Link href={`/s/${s.handle}`} className="flex min-w-0 grow items-center gap-3 !no-underline" style={{ color: "inherit" }}>
                  <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#0D0D0C] text-white">
                    <span className="wordmark text-[15px]">{initials(s.displayName)}</span>
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="t-h3 !text-[15px]">{s.displayName}</span>
                    <span className="t-small muted">{[s.city, storeFacts(s)].filter(Boolean).join(" · ")}</span>
                    {s.drop && <span className="t-small font-bold">{s.drop.title} · {formatIST(s.drop.startsAt)}</span>}
                  </span>
                </Link>
                <FollowChip sellerId={s.id} name={s.displayName} following signedIn className="!h-11 shrink-0" />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState tag="No stores" title="Follow a store." action={<ButtonLink href="/search">Find stores to follow</ButtonLink>}>
          Follow stores to hear when the next drop is announced.
        </EmptyState>
      )}
    </div>
  );
}
