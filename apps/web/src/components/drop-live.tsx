"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatINR } from "@/lib/format";
import { GarmentImage } from "./garment-image";

type Item = { id: string; slug: string; title: string; tagSize: string | null; pricePaise: number; status: string; category: string; coverUrl: string | null };

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Coming soon",
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  PAYMENT_PENDING: "Reserved",
  SOLD: "Sold",
  SOLD_ELSEWHERE: "Sold",
  WITHDRAWN: "Removed",
};

function useCountdown(targetMs: number, offsetMs: number) {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offsetMs), 250);
    return () => clearInterval(t);
  }, [offsetMs]);
  return Math.max(0, targetMs - now);
}

const fmt = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

/**
 * The drop page's interactive part: countdown to the server's opening time, then live item
 * states (polled every 3 s while open) with a Claim button that runs the normal reservation.
 */
export function DropLive({
  dropId,
  startsAt,
  serverNow,
  initialStatus,
  items: initialItems,
  maxHoldsPerBuyer,
  signedIn,
  reminderOn,
}: {
  dropId: string;
  startsAt: string;
  serverNow: string;
  initialStatus: string;
  items: Item[];
  maxHoldsPerBuyer: number;
  signedIn: boolean;
  reminderOn: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // The server's clock is authoritative; offset the countdown by how far this device is off.
  const [offset] = useState(() => new Date(serverNow).getTime() - Date.now());
  const remaining = useCountdown(new Date(startsAt).getTime(), offset);
  const [status, setStatus] = useState(initialStatus);
  const [statuses, setStatuses] = useState<Record<string, string>>(() => Object.fromEntries(initialItems.map((i) => [i.id, i.status])));
  const [toast, setToast] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [reminder, setReminder] = useState(reminderOn);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/drops/${dropId}/live`, { cache: "no-store" });
    if (!res.ok) return;
    const s = (await res.json()) as { status: string; items: { id: string; status: string }[] };
    setStatus(s.status);
    setStatuses(Object.fromEntries(s.items.map((i) => [i.id, i.status])));
  }, [dropId]);

  const open = status === "LIVE" || status === "ENDED" || remaining === 0;
  // Poll while live; also fetch once the countdown hits zero so items flip without a reload.
  useEffect(() => {
    if (!open || status === "ENDED") return;
    const first = setTimeout(refresh, 0); // fetch right away, then every 3 s
    const t = setInterval(refresh, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [open, status, refresh]);

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

  return (
    <div className="space-y-5">
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Opens in</p>
            <p className="font-mono text-3xl font-bold" aria-live="off">{fmt(remaining)}</p>
          </div>
          <button type="button" onClick={toggleReminder} aria-pressed={reminder} className={`rounded-full px-4 py-2 text-sm font-semibold ${reminder ? "border border-line" : "bg-foreground text-background"}`}>
            {reminder ? "Reminder set ✓" : "Remind me"}
          </button>
        </div>
      ) : (
        <p className="rounded-lg border border-foreground p-3 text-sm font-medium">
          {status === "ENDED" ? "This drop has ended." : "The drop is open. First to claim gets 5 minutes to pay."}
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
        {initialItems.map((item) => {
          const s = statuses[item.id] ?? item.status;
          const gone = s === "SOLD" || s === "SOLD_ELSEWHERE" || s === "WITHDRAWN";
          return (
            <div key={item.id} className="space-y-2">
              <Link href={`/p/${item.slug}`} className={`block overflow-hidden rounded-lg ${gone ? "opacity-50" : ""}`}>
                <GarmentImage src={item.coverUrl} alt={item.title} category={item.category} />
              </Link>
              <div className="text-sm">
                <p className="line-clamp-1 font-medium">{item.title}</p>
                <p className="text-muted">{[item.tagSize, formatINR(item.pricePaise)].filter(Boolean).join(" · ")}</p>
              </div>
              {open && s === "AVAILABLE" ? (
                <button
                  type="button"
                  disabled={claiming !== null}
                  onClick={() => claim(item)}
                  className="w-full rounded-full bg-foreground py-2 text-sm font-semibold text-background disabled:opacity-60"
                >
                  {claiming === item.id ? "Claiming…" : "Claim"}
                </button>
              ) : (
                <p className="rounded-full border border-line py-2 text-center text-sm text-muted">{open ? STATUS_LABEL[s] ?? s : "Coming soon"}</p>
              )}
            </div>
          );
        })}
      </div>

      <p role="status" aria-live="polite" className={`toast fixed inset-x-4 bottom-[calc(var(--bnav-h)+16px)] z-40 mx-auto max-w-md justify-center text-center transition-opacity ${toast ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        {toast}
      </p>
    </div>
  );
}
