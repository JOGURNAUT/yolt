import Link from "next/link";
import { formatIST } from "@/lib/format";
import { cx } from "@/components/ui/cx";
import { Stamp } from "@/components/ui/stamp";
import { ReminderButton } from "./reminder-button";

type Drop = { id: string; title: string; startsAt: Date; status: string; maxHoldsPerBuyer: number; pieces: number };

/**
 * DropTicket (board C4): the store's next drop as a ticket stub. Upcoming offers a reminder, live
 * says so and links to the claim. The body links to the drop page either way.
 */
export function DropTicket({ drop, storeName, reminderOn, signedIn }: { drop: Drop; storeName: string; reminderOn: boolean; signedIn: boolean }) {
  const live = drop.status === "LIVE";
  const facts = `${drop.pieces} ${drop.pieces === 1 ? "piece" : "pieces"} · max ${drop.maxHoldsPerBuyer} per person`;
  return (
    <div className={cx("ticket min-h-[108px]", live && "is-live")}>
      <Link href={`/d/${drop.id}`} className="flex min-w-0 grow flex-col gap-1 p-4 !no-underline" style={{ color: "inherit" }}>
        <span className="t-caption flex flex-wrap items-center gap-2 opacity-80">
          {live ? `${storeName} · ${facts}` : `Next drop · ${facts}`}
          {live && (
            <Stamp dot wobble className="!h-[22px] !text-[10px]">
              Live now
            </Stamp>
          )}
        </span>
        <span className="t-h2">{drop.title}</span>
        <span className="t-mono !text-xs">{formatIST(drop.startsAt)}</span>
      </Link>
      <div className="stub" aria-hidden="true">
        <span className="notch" style={{ left: -10, top: -24 }} />
        <span className="notch" style={{ left: -10, bottom: -24 }} />
      </div>
      <div className="flex w-[124px] shrink-0 items-center justify-center p-3 pr-[15px] lg:w-[140px]">
        {live ? (
          <Link
            href={`/d/${drop.id}`}
            className="btn btn-sm h-auto min-h-11 w-full whitespace-normal px-2 py-1.5 text-center leading-tight"
            style={{ background: "var(--accent)", color: "var(--on-accent)", boxShadow: "3px 3px 0 0 var(--background)" }}
          >
            Claim now
          </Link>
        ) : (
          <ReminderButton dropId={drop.id} on={reminderOn} signedIn={signedIn} />
        )}
      </div>
    </div>
  );
}
