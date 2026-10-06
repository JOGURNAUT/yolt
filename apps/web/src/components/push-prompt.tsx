"use client";

import { Bell, BellOff, Check, LoaderCircle } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { Stamp } from "@/components/ui/stamp";
import { enablePush, rememberPushPromptDismissed, shouldOfferPushPrompt } from "@/lib/client/push";

export type PushAsk = {
  reason: "drop";
  /** The drop's name, as shown on the page. */
  title: string;
  /** ISO time the drop opens; the card says when the ping will arrive (15 minutes before). */
  startsAt?: string;
};

type Phase = "ask" | "working" | "blocked" | "done";

/**
 * PushPrompt (board Prompts, sheet C3Navigation): after a buyer taps Remind me we say why we'd
 * like to ping them, and only then let the browser show its own permission prompt. Nothing is
 * asked on arrival; "Not now" is remembered, so it never comes back, and neither does it for
 * someone who is already subscribed or has blocked notifications.
 *
 *   const push = usePushPrompt();
 *   await push.ask({ reason: "drop", title, startsAt });
 *   return <>{push.prompt}</>;
 */
export function usePushPrompt() {
  const [state, setState] = useState<{ ask: PushAsk; phase: Phase } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const ask = useCallback(async (input: PushAsk) => {
    if (await shouldOfferPushPrompt()) setState({ ask: input, phase: "ask" });
  }, []);

  const close = useCallback(() => {
    clearTimeout(closeTimer.current);
    setState(null);
  }, []);

  const dismiss = useCallback(() => {
    rememberPushPromptDismissed();
    close();
  }, [close]);

  const turnOn = useCallback(async () => {
    setState((s) => (s ? { ...s, phase: "working" } : s));
    const r = await enablePush();
    if (r.ok) {
      setState((s) => (s ? { ...s, phase: "done" } : s));
      closeTimer.current = setTimeout(close, 3000);
    } else if (r.reason === "blocked") {
      rememberPushPromptDismissed();
      setState((s) => (s ? { ...s, phase: "blocked" } : s));
    } else {
      close();
    }
  }, [close]);

  // A portal, so a transformed ancestor (cards, carousels) can never anchor the fixed card to itself.
  const prompt = state ? createPortal(<PushPromptCard ask={state.ask} phase={state.phase} onTurnOn={turnOn} onDismiss={dismiss} onClose={close} />, document.body) : null;
  return { ask, prompt };
}

const ist = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { ...o, timeZone: "Asia/Kolkata" });

/** " at 6:45 pm IST on Sat 11 Oct": 15 minutes before the drop opens. */
function pingTime(startsAt?: string) {
  const at = startsAt ? new Date(new Date(startsAt).getTime() - 15 * 60_000) : null;
  if (!at || Number.isNaN(at.getTime())) return " 15 minutes before it opens";
  return ` at ${ist({ hour: "numeric", minute: "2-digit" }).format(at)} IST on ${ist({ weekday: "short", day: "numeric", month: "short" }).format(at)}`;
}

function PushPromptCard({ ask, phase, onTurnOn, onDismiss, onClose }: { ask: PushAsk; phase: Phase; onTurnOn: () => void; onDismiss: () => void; onClose: () => void }) {
  const blocked = phase === "blocked";
  const done = phase === "done";
  const heading = done ? "Pings are on" : blocked ? "Notifications are blocked" : `Get a ping when ${ask.title} opens?`;
  const Icon = done ? Check : blocked ? BellOff : Bell;
  return (
    <section
      aria-labelledby="push-prompt-h"
      className="card raised fixed inset-x-4 bottom-[calc(var(--bnav-h)+16px)] z-40 mx-auto flex max-w-md flex-col gap-3 p-4"
    >
      {(phase === "ask" || phase === "working") && (
        <span className="self-start">
          <Stamp>
            <Bell aria-hidden className="ic ic-14" strokeWidth={ICON_STROKE} />
            Reminder set
          </Stamp>
        </span>
      )}
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={cx("flex size-10 shrink-0 items-center justify-center rounded-full", done ? "bg-accent text-on-accent" : "bg-surface-2")}>
          <Icon className="ic ic-20" strokeWidth={ICON_STROKE} />
        </span>
        <div className="flex min-w-0 flex-col gap-1" role="status">
          <h2 id="push-prompt-h" className="t-h3 !normal-case !font-sans">
            {heading}
          </h2>
          <p className="t-small muted">
            {done
              ? "We'll notify you 15 minutes before it opens, and when it goes live."
              : blocked
                ? "Notifications are blocked for YOLT in this browser. Allow them in your browser settings to get drop pings."
                : `We'll notify you${pingTime(ask.startsAt)}. Only drops you choose, nothing else.`}
          </p>
        </div>
      </div>
      {phase === "ask" || phase === "working" ? (
        <div className="flex gap-2">
          <button type="button" onClick={onDismiss} disabled={phase === "working"} className="btn btn-ghost min-h-11 flex-1">
            Not now
          </button>
          <button type="button" onClick={onTurnOn} disabled={phase === "working"} aria-busy={phase === "working" || undefined} className="btn btn-primary min-h-11 flex-1">
            {phase === "working" && <LoaderCircle aria-hidden className="ic ic-16 spin" strokeWidth={ICON_STROKE} />}
            Turn on notifications
          </button>
        </div>
      ) : (
        <button type="button" onClick={onClose} className="btn btn-secondary min-h-11">
          {done ? "Done" : "Got it"}
        </button>
      )}
    </section>
  );
}
