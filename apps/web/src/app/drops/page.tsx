import type { Metadata } from "next";
import { DropTicket, EndedDropTicket } from "@/components/landing/drop-ticket";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getDropsPage } from "@/lib/server/queries";
import { getCurrentUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Drops" };

/** `/drops` (boards Drops, DropsDesktop): live now, upcoming and recently ended, as ticket stubs. */
export default async function DropsPage() {
  const user = await getCurrentUser();
  const { live, upcoming, ended, reminders } = await getDropsPage(user?.userId ?? null);
  const none = live.length + upcoming.length + ended.length === 0;

  const group = (title: string, children: React.ReactNode) => (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="t-h2 sec-title">{title}</h2>
      <div className="grid gap-3 lg:grid-cols-2 lg:gap-5 min-[1600px]:grid-cols-3">{children}</div>
    </section>
  );

  return (
    <div className="page-wide flex flex-col gap-6 lg:gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="t-display">Drops</h1>
        <p className="t-small muted lg:t-body">Drops open on our clock. First to claim gets 5 minutes to pay.</p>
      </div>

      {none ? (
        <EmptyState tag="No drops" title="No drops right now" action={<ButtonLink href="/search">Find stores to follow</ButtonLink>}>
          Follow stores to hear when the next one is announced.
        </EmptyState>
      ) : (
        <>
          {live.length > 0 && group("Live now", live.map((d) => <DropTicket key={d.id} drop={d} signedIn={user !== null} reminderOn={reminders.has(d.id)} />))}
          {upcoming.length > 0 && group("Upcoming", upcoming.map((d) => <DropTicket key={d.id} drop={d} signedIn={user !== null} reminderOn={reminders.has(d.id)} />))}
          {live.length + upcoming.length === 0 && <p className="t-body muted">Nothing is live or announced yet. Follow stores to hear first.</p>}
          {ended.length > 0 && group("Recently ended", ended.map((d) => <EndedDropTicket key={d.id} drop={d} />))}
        </>
      )}
    </div>
  );
}
