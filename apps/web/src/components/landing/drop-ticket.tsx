import Link from "next/link";
import { formatIST } from "@/lib/format";
import type { DropTicketData, EndedDropData } from "@/lib/server/queries";
import { cx } from "@/components/ui/cx";
import { Stamp } from "@/components/ui/stamp";
import { RemindButton } from "./drop-clock";

const istTime = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

const dayIST = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** A drop that has ended (board Drops, "Recently ended"): muted, and the whole ticket opens the drop to see what sold. */
export function EndedDropTicket({ drop, className }: { drop: EndedDropData; className?: string }) {
  const result = drop.pieces > 0 && drop.sold === drop.pieces ? "all sold" : `${drop.sold} sold`;
  return (
    <article aria-label={`Ended drop: ${drop.title}`} className={cx("ticket is-ended relative min-h-[126px] lg:min-h-[130px]", className)}>
      <div className="flex grow flex-col gap-1.5 p-4 lg:p-5">
        <span className="t-caption opacity-80">{drop.sellerName}</span>
        <h3 className="t-h2">{drop.title}</h3>
        <span className="t-mono !text-xs">Ended {dayIST.format(drop.startsAt)}</span>
        <span className="t-caption opacity-80 !font-medium">
          {drop.pieces} {drop.pieces === 1 ? "piece" : "pieces"} · {result}
        </span>
      </div>
      <div className="stub">
        <span className="notch" style={{ left: -10, top: -24 }} />
        <span className="notch" style={{ left: -10, bottom: -24 }} />
      </div>
      <div className="flex w-[124px] shrink-0 items-center justify-center p-3 pr-[15px] lg:w-[156px]">
        <Link href={`/d/${drop.id}`} className="btn btn-ghost min-h-11 text-sm after:absolute after:inset-0 after:content-['']">
          See what sold
        </Link>
      </div>
    </article>
  );
}

/**
 * DropTicket (board C4): a ticket stub with a perforated edge. Upcoming drops offer Remind me and
 * a preview; live ones show a "Live now" stamp and Claim now. The page that renders it gives the
 * signed-in state and which reminders are already set.
 */
export function DropTicket({ drop, signedIn, reminderOn, className }: { drop: DropTicketData; signedIn: boolean; reminderOn: boolean; className?: string }) {
  const meta = `${drop.sellerName} · ${drop.pieces} ${drop.pieces === 1 ? "piece" : "pieces"} · max ${drop.maxHoldsPerBuyer} per person`;
  return (
    <article aria-label={`Drop: ${drop.title}`} className={cx("ticket min-h-[132px] lg:min-h-[168px]", drop.live && "is-live", className)}>
      <div className="flex grow flex-col justify-between gap-2.5 p-4 lg:p-[22px]">
        <div className="flex flex-col gap-1.5 lg:gap-2">
          {drop.live && (
            <span className="self-start">
              <Stamp dot>Live now</Stamp>
            </span>
          )}
          <span className="t-caption opacity-80">{meta}</span>
          <h3 className="t-h1 !text-[22px] !leading-6 lg:!text-[28px] lg:!leading-[30px]">{drop.title}</h3>
          <span className="t-mono !text-xs">
            {drop.live ? `Opened ${istTime.format(drop.startsAt)} IST · ${drop.available} of ${drop.pieces} left` : formatIST(drop.startsAt)}
          </span>
        </div>
      </div>
      <div className="stub">
        <span className="notch" style={{ left: -10, top: -24 }} />
        <span className="notch" style={{ left: -10, bottom: -24 }} />
      </div>
      <div className="flex w-[124px] shrink-0 flex-col items-stretch justify-center gap-1.5 p-3 pr-[15px] lg:w-[156px] lg:gap-2.5 lg:p-3.5 lg:pr-[17px]">
        {drop.live ? (
          <Link href={`/d/${drop.id}`} className="btn min-h-11 bg-accent px-2 py-1.5 text-center text-sm leading-tight !text-on-accent shadow-[3px_3px_0_0_var(--background)] whitespace-normal">
            Claim now
          </Link>
        ) : (
          <RemindButton dropId={drop.id} reminderOn={reminderOn} signedIn={signedIn} className="btn btn-primary min-h-11 whitespace-normal px-2 py-1.5 text-center text-sm leading-tight" />
        )}
        {!drop.live && (
          <Link href={`/d/${drop.id}`} className="btn btn-ghost h-11 text-sm">
            Preview
          </Link>
        )}
      </div>
    </article>
  );
}
