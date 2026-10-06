import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDropView, hasDropReminder } from "@yolt/core";
import { DropLive } from "@/components/drop-live";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatIST } from "@/lib/format";
import { db } from "@/lib/server/db";
import { CLAIM_HOLD_MINUTES, getCancelledDrop, getDropHolds } from "@/lib/server/queries";
import { getCurrentUser } from "@/lib/server/session";

const istTime = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function generateMetadata({ params }: PageProps<"/d/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!validId(id)) return {};
  const v = await getDropView(db, id);
  return v ? { title: v.drop.title, description: `${v.seller.displayName} · ${formatIST(v.drop.startsAt)}` } : {};
}

export default async function DropPage({ params }: PageProps<"/d/[id]">) {
  await connection();
  const { id } = await params;
  if (!validId(id)) notFound();
  const view = await getDropView(db, id);
  if (!view) {
    const cancelled = await getCancelledDrop(id);
    if (!cancelled) notFound();
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 py-6">
        <EmptyState tag="Cancelled" title="This drop was cancelled" action={<ButtonLink href="/drops">See other drops</ButtonLink>}>
          {cancelled.storeName} cancelled this drop. Nothing was charged and nothing is held.
        </EmptyState>
        <ButtonLink href={`/s/${cancelled.handle}`} variant="secondary" block>
          See everything at {cancelled.storeName}
        </ButtonLink>
      </div>
    );
  }
  const user = await getCurrentUser();
  const [reminderOn, holds] = await Promise.all([
    user ? hasDropReminder(db, { userId: user.userId, dropId: id }) : false,
    user ? getDropHolds(user.userId, id) : [],
  ]);
  const { drop, seller, items } = view;

  return (
    <DropLive
      dropId={drop.id}
      title={drop.title}
      coverUrl={drop.coverUrl}
      seller={seller}
      startsLabel={formatIST(drop.startsAt)}
      openTimeLabel={`${istTime.format(drop.startsAt)} IST`}
      startsAt={drop.startsAt.toISOString()}
      serverNow={new Date().toISOString()}
      initialStatus={drop.status}
      items={items}
      maxHoldsPerBuyer={drop.maxHoldsPerBuyer}
      holdMinutes={CLAIM_HOLD_MINUTES}
      holds={holds.map((h) => ({ listingId: h.listingId, orderId: h.orderId, expiresAt: h.expiresAt.toISOString() }))}
      signedIn={user !== null}
      reminderOn={reminderOn}
    />
  );
}
