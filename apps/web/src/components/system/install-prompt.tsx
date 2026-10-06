"use client";

import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Share, SquarePlus } from "lucide-react";
import { Button } from "../ui/button";
import { ICON_STROKE } from "../ui/cx";
import { INSTALL_EVENT_KEY } from "@/lib/pwa";
import { useToast } from "../ui/toast-provider";

/**
 * Install hint (boards PromptInstall, PromptIos). The card never shows on arrival: other code asks
 * for it at a good moment with `showInstallHint("order" | "reminder")` from `useInstallPrompt()`.
 *
 *   order     after a confirmed order (wired in checkout-view)
 *   reminder  after Remind me (called by the push work, which owns that trigger)
 *
 * It then shows only if the browser can install the app (Chromium's beforeinstallprompt, or iOS
 * Safari's Share sheet), the app isn't already installed, and the person hasn't said Not now in
 * the last 30 days. Android and desktop Chrome get an Add button; iPhone gets the two steps.
 */
export type InstallTrigger = "order" | "reminder";

const KEY = "yolt-install-hint";
const COOLDOWN_MS = 30 * 86_400_000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type Stored = { dismissedAt?: number; installed?: boolean };

function readStored(): Stored {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Stored;
  } catch {
    return {};
  }
}
function writeStored(patch: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readStored(), ...patch }));
  } catch {
    // Storage can be blocked; the card then reappears next visit instead of never.
  }
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function isIos() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

const InstallContext = createContext<{ showInstallHint: (trigger: InstallTrigger) => void }>({ showInstallHint: () => {} });

/** The trigger API. Safe to call anywhere; it does nothing where install isn't possible or wanted. */
export const useInstallPrompt = () => useContext(InstallContext);

type Variant = "native" | "ios";
const VariantContext = createContext<{ variant: Variant | null; install: () => void; dismiss: () => void }>({
  variant: null,
  install: () => {},
  dismiss: () => {},
});

export function InstallPromptProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [variant, setVariant] = useState<Variant | null>(null);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  // Set once something asked for the hint; the card shows as soon as the browser allows it.
  const wanted = useRef(false);

  const evaluate = useCallback(() => {
    if (!wanted.current) return;
    const stored = readStored();
    if (isStandalone() || stored.installed || (stored.dismissedAt && Date.now() - stored.dismissedAt < COOLDOWN_MS)) {
      wanted.current = false;
      return;
    }
    if (isIos()) setVariant("ios");
    else if (deferred.current) setVariant("native");
  }, []);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      evaluate();
    };
    const onInstalled = () => {
      writeStored({ installed: true });
      deferred.current = null;
      wanted.current = false;
      setVariant(null);
      toast("YOLT is on your home screen.", { tone: "success" });
    };
    // The event may have fired before this mounted (see INSTALL_CAPTURE_SCRIPT in the layout).
    const early = (window as unknown as Record<string, unknown>)[INSTALL_EVENT_KEY];
    if (early) onPrompt(early as Event);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [evaluate, toast]);

  const showInstallHint = useCallback(
    // The trigger is for callers' readability and later analytics; the rules are the same for both.
    (trigger: InstallTrigger) => {
      void trigger;
      wanted.current = true;
      evaluate();
    },
    [evaluate],
  );

  const dismiss = useCallback(() => {
    writeStored({ dismissedAt: Date.now() });
    wanted.current = false;
    setVariant(null);
  }, []);

  const install = useCallback(async () => {
    const event = deferred.current;
    if (!event) return;
    setVariant(null);
    deferred.current = null;
    await event.prompt();
    const { outcome } = await event.userChoice;
    // Accepting fires appinstalled; backing out of the browser's own dialog counts as Not now.
    if (outcome === "dismissed") writeStored({ dismissedAt: Date.now() });
  }, []);

  const api = useMemo(() => ({ showInstallHint }), [showInstallHint]);
  const ui = useMemo(() => ({ variant, install: () => void install(), dismiss }), [variant, install, dismiss]);

  return (
    <InstallContext.Provider value={api}>
      <VariantContext.Provider value={ui}>{children}</VariantContext.Provider>
    </InstallContext.Provider>
  );
}

/** InstallCard (board C3Navigation). Mount once, inside InstallPromptProvider. */
export function InstallCard() {
  const { variant, install, dismiss } = useContext(VariantContext);
  if (!variant) return null;

  return (
    <section
      aria-label="Add YOLT to your home screen"
      data-variant={variant}
      className="card raised fixed inset-x-4 bottom-[calc(var(--bnav-h)+16px)] z-40 mx-auto flex max-w-md items-start gap-3 p-4 lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0"
    >
      <Image src="/icons/icon-192.png" alt="" width={44} height={44} className="size-11 shrink-0 rounded-[10px]" unoptimized />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="t-h3">Add YOLT to your home screen for drop reminders</h2>
          {variant === "ios" ? (
            <p className="t-small muted">
              Tap <Share aria-hidden className="ic ic-16 inline-block align-[-3px]" strokeWidth={ICON_STROKE} /> <strong className="text-foreground">Share</strong>, then{" "}
              <SquarePlus aria-hidden className="ic ic-16 inline-block align-[-3px]" strokeWidth={ICON_STROKE} /> <strong className="text-foreground">Add to Home Screen</strong>.
            </p>
          ) : (
            <p className="t-small muted">One tap, no app store. Opens like an app.</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {variant === "native" && (
            <Button size="md" onClick={install}>
              Add to home screen
            </Button>
          )}
          <Button size="md" variant={variant === "ios" ? "secondary" : "ghost"} onClick={dismiss}>
            Not now
          </Button>
        </div>
      </div>
    </section>
  );
}
