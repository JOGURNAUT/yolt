import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDropView, hasDropReminder } from "@yolt/core";
import { DropLive } from "@/components/drop-live";
import { formatIST } from "@/lib/format";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/session";

export async function generateMetadata({ params }: PageProps<"/d/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return {};
  const v = await getDropView(db, id);
  return v ? { title: v.drop.title, description: `${v.seller.displayName} · ${formatIST(v.drop.startsAt)}` } : {};
}

export default async function DropPage({ params }: PageProps<"/d/[id]">) {
  await connection();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const view = await getDropView(db, id);
  if (!view) notFound();
  const user = await getCurrentUser();
  const reminderOn = user ? await hasDropReminder(db, { userId: user.userId, dropId: id }) : false;
  const { drop, seller, items } = view;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm text-muted">
          Drop by <Link href={`/s/${seller.handle}`} className="underline">{seller.displayName}</Link>
        </p>
        <h1 className="text-2xl font-bold">{drop.title}</h1>
        <p className="text-sm">
          {formatIST(drop.startsAt)} · {items.length} {items.length === 1 ? "piece" : "pieces"}
          {view.reminders > 0 && <span className="text-muted"> · {view.reminders} waiting</span>}
        </p>
      </header>

      <section aria-label="Rules" className="rounded-lg bg-surface p-4 text-sm">
        <p className="font-medium">How it works</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
          <li>Everything opens at exactly {formatIST(drop.startsAt)}, by YOLT&apos;s clock.</li>
          <li>First to claim a piece gets 5 minutes to pay. If they don&apos;t, it comes back for others.</li>
          <li>
            You can hold {drop.maxHoldsPerBuyer} piece{drop.maxHoldsPerBuyer === 1 ? "" : "s"} from this drop at a time.
          </li>
          <li>Sign in before it opens so you&apos;re ready to claim.</li>
        </ul>
      </section>

      <DropLive
        dropId={drop.id}
        startsAt={drop.startsAt.toISOString()}
        serverNow={new Date().toISOString()}
        initialStatus={drop.status}
        items={items}
        maxHoldsPerBuyer={drop.maxHoldsPerBuyer}
        signedIn={user !== null}
        reminderOn={reminderOn}
      />
    </div>
  );
}
