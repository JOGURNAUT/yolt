"use client";

import { Bell, CalendarClock, Check, Clock, LoaderCircle, ShieldCheck, Undo2, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { initials } from "@/components/search/store-row";
import { ShareButton } from "@/components/store/share-button";
import { ButtonLink } from "@/components/ui/button";
import { Countdown } from "@/components/ui/countdown";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { Stamp } from "@/components/ui/stamp";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { Toast } from "@/components/ui/toast";
import { CONDITION, formatINR } from "@/lib/format";
import "@/styles/drops.css";
import { GarmentImage } from "./garment-image";

type Item = { id: string; slug: string; title: string; tagSize: string | null; condition: string; pricePaise: number; status: string; category: string; coverUrl: string | null };
type Hold = { listingId: string; orderId: string; expiresAt: string };

const GONE = new Set(["SOLD", "SOLD_ELSEWHERE", "WITHDRAWN"]);

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** A clock that runs on the server's time: `offsetMs` is how far this device is behind the server. */
function useServerNow(serverNow: string, offsetMs: number, everyMs: number) {
  // Starts at the server's render time, so the first client render matches the HTML it hydrates.
  const [now, setNow] = useState(() => new Date(serverNow).getTime());
  useEffect(() => {
    const tick = () => setNow(Date.now() + offsetMs);
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, everyMs);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [offsetMs, everyMs]);
  return now;
}

/**
 * The drop page (boards Drop, DropPreview, LiveDrop, DropDesktop and the states between): the
 * countdown to the server's opening time, then live piece states polled every 3 s, with a Claim
 * that runs the normal reservation and goes to checkout. Nothing here needs a reload.
 */
export function DropLive({
  dropId,
  title,
  coverUrl,
  seller,
  startsLabel,
  openTimeLabel,
  startsAt,
  serverNow,
  initialStatus,
  items: initialItems,
  maxHoldsPerBuyer,
  holdMinutes,
  holds,
  signedIn,
  reminderOn,
}: {
  dropId: string;
  title: string;
  coverUrl: string | null;
  seller: { handle: string; displayName: string };
  startsLabel: string;
  openTimeLabel: string;
  startsAt: string;
  serverNow: string;
  initialStatus: string;
  items: Item[];
  maxHoldsPerBuyer: number;
  holdMinutes: number;
  holds: Hold[];
  signedIn: boolean;
  reminderOn: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // The server's clock is authoritative; offset every timer by how far this device is off.
  const [offset] = useState(() => new Date(serverNow).getTime() - Date.now());
  const now = useServerNow(serverNow, offset, 250);
  const remaining = Math.max(0, new Date(startsAt).getTime() - now);
  const [status, setStatus] = useState(initialStatus);
  const [statuses, setStatuses] = useState<Record<string, string>>(() => Object.fromEntries(initialItems.map((i) => [i.id, i.status])));
  const [toast, setToast] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [reminder, setReminder] = useState(reminderOn);
  const [flipped, setFlipped] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/drops/${dropId}/live`, { cache: "no-store" });
    if (!res.ok) return;
    const s = (await res.json()) as { status: string; items: { id: string; status: string }[] };
    setStatus(s.status);
    setStatuses(Object.fromEntries(s.items.map((i) => [i.id, i.status])));
  }, [dropId]);

  const open = status === "LIVE" || status === "ENDED" || remaining === 0;
  const ended = status === "ENDED";
  // Poll while live; also fetch once the countdown hits zero so the pieces flip without a reload.
  useEffect(() => {
    if (!open || ended) return;
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [open, ended, refresh]);

  // The flip animation plays once, for pieces that turn into Claim while you watch.
  useEffect(() => {
    if (open && initialStatus !== "LIVE" && initialStatus !== "ENDED") {
      const t = setTimeout(() => setFlipped(true), 0);
      return () => clearTimeout(t);
    }
  }, [open, initialStatus]);

  function show(message: string) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  async function claim(item: Item) {
    if (!signedIn) return router.push(`/login?next=${encodeURIComponent(pathname)}`);
    setClaiming(item.id);
    const res = await fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ listingIds: [item.id] }) });
    const body = (await res.json().catch(() => ({}))) as { orderId?: string; error?: string };
    setClaiming(null);
    if (res.ok && body.orderId) return router.push(`/checkout/${body.orderId}`);
    if (body.error === "UNAVAILABLE") show("Someone just reserved this. Try another piece.");
    else if (body.error === "DROP_LIMIT") show(`You can hold ${maxHoldsPerBuyer} piece${maxHoldsPerBuyer === 1 ? "" : "s"} from this drop at a time. Pay for yours first.`);
    else show("Couldn't claim that. Try again.");
    void refresh();
  }

  async function toggleReminder() {
    if (!signedIn) return router.push(`/login?next=${encodeURIComponent(pathname)}`);
    const next = !reminder;
    setReminder(next);
    const res = await fetch(`/api/drops/${dropId}/reminder`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: next }) });
    if (!res.ok) setReminder(!next);
  }

  // The buyer's own holds that are still running (the server lists them at render time).
  const mine = holds.filter((h) => new Date(h.expiresAt).getTime() > now && !GONE.has(statuses[h.listingId] ?? ""));
  const mineIds = new Set(mine.map((h) => h.listingId));
  const firstHold = mine[0];
  const holdLeft = firstHold ? new Date(firstHold.expiresAt).getTime() - now : 0;
  const available = initialItems.filter((i) => (statuses[i.id] ?? i.status) === "AVAILABLE").length;
  const sold = initialItems.filter((i) => GONE.has(statuses[i.id] ?? i.status)).length;

  const stamp = ended ? { label: "Ended", tone: "bg-[#E4E2DC]" } : open ? { label: "Live now", tone: "bg-accent" } : { label: "Upcoming", tone: "bg-white" };
  const leftLine = ended ? "all sold" : open ? `${available} of ${initialItems.length} left` : null;

  const rules = [
    { icon: CalendarClock, text: `Opens at ${openTimeLabel}. Nobody can claim before then.` },
    { icon: Clock, text: `First to claim gets ${holdMinutes} minutes to pay.` },
    { icon: UserRound, text: `Max ${maxHoldsPerBuyer} piece${maxHoldsPerBuyer === 1 ? "" : "s"} per person.` },
    { icon: Undo2, text: "If someone doesn’t pay in time, the piece goes back on sale." },
  ];

  const band = (
    <section aria-labelledby="drop-h" className="drop-band flex flex-col gap-3.5 px-4 pb-7 pt-3 lg:gap-4 lg:p-7">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/s/${seller.handle}`} className="flex min-h-11 items-center gap-2.5 !no-underline">
          <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-white text-[#0D0D0C]">
            <span className="wordmark text-xs">{initials(seller.displayName)}</span>
          </span>
          <span className="t-small !font-bold">{seller.displayName}</span>
        </Link>
        <div className="flex items-center gap-2">
          <ShareButton title={title} label="Share drop" iconOnly />
          <Stamp dot className={cx("!border-transparent", stamp.tone)}>
            {stamp.label}
          </Stamp>
        </div>
      </div>

      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- the drop's own cover
        <img src={coverUrl} alt="" className="aspect-[16/9] w-full rounded-2xl object-cover" />
      )}

      <h1 id="drop-h" className="t-display-xl break-words !text-[40px] !leading-10 lg:!text-[40px]">
        {title}
      </h1>
      <div className="flex flex-col gap-1">
        <span className="t-mono">{startsLabel}</span>
        <span className="t-small text-[#E4E2DC]">
          {initialItems.length} {initialItems.length === 1 ? "piece" : "pieces"} · max {maxHoldsPerBuyer} per person{leftLine ? ` · ${leftLine}` : ""}
        </span>
      </div>

      {!open && (
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-2">
            <span className="t-caption uppercase text-[#E4E2DC]">Opens in</span>
            <Countdown ms={remaining} label="Drop opens in" />
          </div>
          <button
            type="button"
            onClick={toggleReminder}
            aria-pressed={reminder}
            className="btn btn-lg btn-block"
            style={reminder ? { background: "#FFFFFF", color: "#0D0D0C", boxShadow: "none" } : { background: "var(--accent)", color: "#0D0D0C", boxShadow: "4px 4px 0 0 #FFFFFF" }}
          >
            {reminder ? <Check aria-hidden className="ic" strokeWidth={ICON_STROKE} /> : <Bell aria-hidden className="ic" strokeWidth={ICON_STROKE} />}
            {reminder ? "Reminder set ✓" : "Remind me"}
          </button>
          {reminder && (
            <p role="status" className="t-small text-[#E4E2DC]">
              We&apos;ll remind you 15 minutes before it opens. Tap again to turn it off.
            </p>
          )}
        </div>
      )}
      {open && !ended && <p className="t-body font-semibold">The drop is open. First to claim gets {holdMinutes} minutes to pay.</p>}
      {ended && (
        <p className="t-body font-semibold">
          This drop has ended. {sold === initialItems.length ? "Every piece found its next home." : `${sold} of ${initialItems.length} pieces found a home.`}
        </p>
      )}

      {firstHold && !ended && (
        <div role="group" aria-label="Your reserved pieces" className={cx("flex flex-col gap-3 rounded-2xl p-3.5 text-[#0D0D0C]", holdLeft < 60_000 ? "bg-warning !text-on-warning" : "bg-accent")}>
          <div className="flex items-center gap-3">
            <Clock aria-hidden className="ic ic-24" strokeWidth={ICON_STROKE} />
            <span className="flex grow flex-col gap-0.5">
              <span className="text-[15px] font-bold leading-5">Reserved for you · {mine.length === 1 ? "1 piece" : `${mine.length} pieces`}</span>
              <span className="text-xs font-medium leading-4">{holdLeft < 60_000 ? "Under a minute left. Pay now to keep it." : "Nobody else can claim it while this runs."}</span>
            </span>
            <span role="timer" aria-label={`Time left to pay ${mmss(holdLeft)}`} className="t-mono !text-2xl">
              {mmss(holdLeft)}
            </span>
          </div>
          <ButtonLink href={`/checkout/${firstHold.orderId}`} size="lg" block>
            Pay now
          </ButtonLink>
        </div>
      )}

      <div className="hidden flex-col gap-3 lg:flex">
        <RulesList rules={rules} />
      </div>
    </section>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:items-start lg:gap-6">
      <div className="-mx-4 -mt-4 lg:m-0">{band}</div>

      <div className="flex flex-col gap-5">
        <section aria-labelledby="pieces-h" className="flex flex-col gap-3">
          <h2 id="pieces-h" className="t-h2">
            The pieces
          </h2>
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-5">
            {initialItems.map((item) => {
              const s = statuses[item.id] ?? item.status;
              const gone = GONE.has(s);
              const isMine = mineIds.has(item.id);
              const taken = !isMine && (s === "RESERVED" || s === "PAYMENT_PENDING");
              const canClaim = open && !ended && s === "AVAILABLE";
              let badge: { tone: BadgeTone; label: string; icon: typeof Check } | null = null;
              if (isMine) badge = { tone: "available", label: "Reserved", icon: Check };
              else if (taken) badge = { tone: "reserved", label: "Reserved", icon: Clock };
              else if (s === "SOLD" || s === "SOLD_ELSEWHERE") badge = { tone: "soldout", label: "Sold", icon: X };
              else if (s === "WITHDRAWN") badge = { tone: "removed", label: "Removed", icon: X };
              else if (!open && s === "SCHEDULED") badge = { tone: "soon", label: "Coming soon", icon: CalendarClock };
              const meta = [item.tagSize, CONDITION[item.condition as keyof typeof CONDITION]?.label].filter(Boolean).join(" · ");
              return (
                <article key={item.id} aria-label={item.title} className={cx("dp", isMine && "is-mine", gone && "is-gone", taken && "is-taken")}>
                  <Link href={`/p/${item.slug}`} className="photo" aria-label={`${item.title}, details`}>
                    <GarmentImage src={item.coverUrl} alt={item.title} category={item.category} />
                  </Link>
                  <div className="flex min-w-0 grow flex-col gap-1.5">
                    <Link href={`/p/${item.slug}`} className="t-h3 !text-[15px] !leading-5 !no-underline" style={{ color: "inherit" }}>
                      {item.title}
                    </Link>
                    {meta && <span className="t-small muted">{meta}</span>}
                    <span className="t-h3 !text-base">{formatINR(item.pricePaise)}</span>
                    <div className="mt-auto flex flex-wrap items-center gap-2">
                      {badge && (
                        <StatusBadge tone={badge.tone}>
                          <badge.icon aria-hidden className="ic ic-14" strokeWidth={ICON_STROKE} />
                          {badge.label}
                        </StatusBadge>
                      )}
                      {canClaim && (
                        <button
                          type="button"
                          disabled={claiming !== null}
                          aria-busy={claiming === item.id || undefined}
                          onClick={() => claim(item)}
                          className={cx("btn btn-sm btn-primary !h-11 !px-5", flipped && "claimflip")}
                        >
                          {claiming === item.id ? (
                            <>
                              <LoaderCircle aria-hidden className="ic ic-16 spin" strokeWidth={ICON_STROKE} />
                              Claiming…
                            </>
                          ) : (
                            "Claim"
                          )}
                        </button>
                      )}
                    </div>
                    {isMine && <span className="help">Held while your timer runs. Pay to make it yours.</span>}
                    {taken && <span className="help">Someone&apos;s paying. If they don&apos;t in {holdMinutes} minutes, it&apos;s back.</span>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {ended ? (
          <ButtonLink href={`/s/${seller.handle}`} variant="secondary" block>
            Follow {seller.displayName} for the next one
          </ButtonLink>
        ) : (
          <>
            <section aria-labelledby="hw-h" className="card flex flex-col gap-2.5 p-4 lg:hidden">
              <h2 id="hw-h" className="t-h3 !normal-case !font-sans">
                How this drop works
              </h2>
              <RulesList rules={rules} tone="light" />
            </section>
            <div className="flex items-start gap-2.5 rounded-[14px] bg-surface-2 p-3.5">
              <ShieldCheck aria-hidden className="ic shrink-0" strokeWidth={ICON_STROKE} />
              <span className="t-small">No size returns: check the measurements. Full refund if it isn&apos;t as described, arrives damaged, or never arrives.</span>
            </div>
            <ButtonLink href={`/s/${seller.handle}`} variant="secondary" block>
              See everything at {seller.displayName}
            </ButtonLink>
          </>
        )}
      </div>

      {toast && (
        <Toast tone="info" onDismiss={() => setToast(null)} className="fixed inset-x-4 bottom-[calc(var(--bnav-h)+16px)] z-40 mx-auto max-w-md">
          {toast}
        </Toast>
      )}
    </div>
  );
}

function RulesList({ rules, tone = "dark" }: { rules: { icon: typeof Check; text: string }[]; tone?: "dark" | "light" }) {
  return (
    <ul className={cx("flex flex-col gap-2", tone === "dark" && "text-[#E4E2DC]")}>
      {rules.map((r) => (
        <li key={r.text} className="t-small flex items-start gap-2.5">
          <r.icon aria-hidden className="ic ic-16 mt-px shrink-0" strokeWidth={ICON_STROKE} />
          <span>{r.text}</span>
        </li>
      ))}
    </ul>
  );
}
