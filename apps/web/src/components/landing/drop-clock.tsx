"use client";

import { Check } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePushPrompt } from "@/components/push-prompt";
import { Countdown } from "@/components/ui/countdown";
import { cx, ICON_STROKE } from "@/components/ui/cx";

/**
 * A Countdown that runs on the server's clock (the device's may be off), like the drop page.
 * When it reaches zero the page refreshes once, so the drop shows as live without a reload.
 */
export function DropCountdown({ startsAt, serverNow, size = "sm", className }: { startsAt: string; serverNow: string; size?: "lg" | "sm"; className?: string }) {
  const router = useRouter();
  const target = new Date(startsAt).getTime();
  const [ms, setMs] = useState(() => target - new Date(serverNow).getTime());
  const refreshed = useRef(false);

  useEffect(() => {
    const offset = new Date(serverNow).getTime() - Date.now();
    const tick = () => {
      const left = target - (Date.now() + offset);
      setMs(left);
      if (left <= 0 && !refreshed.current) {
        refreshed.current = true;
        router.refresh();
      }
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [target, serverNow, router]);

  return <Countdown ms={ms} size={size} className={className} />;
}

/**
 * Remind me for a drop. Guests are sent to sign in and brought back; signed-in buyers toggle the
 * reminder (the same route the drop page uses), and the button flips straight away.
 */
export function RemindButton({
  dropId,
  title,
  whenText,
  reminderOn,
  signedIn,
  className,
  style,
}: {
  dropId: string;
  title: string;
  whenText?: string;
  reminderOn: boolean;
  signedIn: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [on, setOn] = useState(reminderOn);
  const push = usePushPrompt();

  async function toggle() {
    if (!signedIn) return router.push(`/login?next=${encodeURIComponent(pathname)}`);
    const next = !on;
    setOn(next);
    const res = await fetch(`/api/drops/${dropId}/reminder`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: next }) });
    if (!res.ok) setOn(!next);
    // TODO: showInstallHint("reminder") after the push prompt once useInstallPrompt lands with the PWA shell.
    else if (next) void push.ask({ reason: "drop", title, whenText });
  }

  return (
    <>
      <button type="button" onClick={toggle} className={cx(className)} style={style}>
        {on && <Check aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />}
        {on ? "Reminder set" : "Remind me"}
      </button>
      {push.prompt}
    </>
  );
}

/** Follow a store from a card. Guests are sent to sign in and brought back. */
export function FollowChip({ sellerId, name, following, signedIn, className }: { sellerId: string; name: string; following: boolean; signedIn: boolean; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [on, setOn] = useState(following);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!signedIn) return router.push(`/login?next=${encodeURIComponent(pathname)}`);
    setBusy(true);
    const res = on
      ? await fetch(`/api/follows/${sellerId}`, { method: "DELETE" })
      : await fetch("/api/follows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sellerId }) });
    setBusy(false);
    if (res.ok) setOn(!on);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label={`${on ? "Following" : "Follow"} ${name}`}
      className={cx("btn btn-sm", on ? "btn-secondary" : "btn-primary", className)}
    >
      {on ? "Following" : "Follow"}
    </button>
  );
}
