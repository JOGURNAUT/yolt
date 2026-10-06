"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { CircleAlert, MessageCircle } from "lucide-react";
import { normalizeIndianMobile } from "@yolt/shared";
import { Button } from "./ui/button";
import { ICON_STROKE } from "./ui/cx";
import { OtpInput } from "./ui/otp-input";
import { PhoneInput } from "./ui/phone-input";

type Step = { kind: "phone" } | { kind: "code"; phone: string; sentTo: string; channel: string; devCode?: string };
type Message = { text: string; tone: "error" | "info" };

const PHONE_HINT = "We'll send a 6-digit code on WhatsApp.";

const ERRORS: Record<string, string> = {
  INVALID_PHONE: "Enter a valid 10-digit mobile number.",
  RESEND_COOLDOWN: "Please wait a few seconds before asking for another code.",
  TOO_MANY_REQUESTS: "Too many codes requested. Try again in an hour.",
  OTP_DELIVERY_FAILED: "We couldn't send the code right now. Try again in a minute.",
  TOO_MANY_ATTEMPTS: "Too many tries. Ask for a new code.",
};

type OtpResponse = {
  error?: string;
  details?: { retryAfterSeconds?: number; attemptsLeft?: number };
  sentTo?: string;
  channel?: string;
  devCode?: string;
  isNewUser?: boolean;
};

const clock = (s: number) => `0:${String(s).padStart(2, "0")}`;

/**
 * Phone sign-in (boards SignIn*): number, then a 6-digit code on WhatsApp, with SMS as the
 * fallback. Used on the /login page and in the sheet. Afterwards the buyer returns to `next`.
 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [limited, setLimited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const messageId = useId();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(channel: "WHATSAPP" | "SMS" = "WHATSAPP", opts: { notice?: string } = {}) {
    const normalized = normalizeIndianMobile(step.kind === "code" ? step.phone : phone);
    if (!normalized) return setPhoneError(ERRORS.INVALID_PHONE!);
    setBusy(true);
    setPhoneError(null);
    setBanner(null);
    const res = await fetch("/api/auth/otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: normalized, channel }),
    });
    setBusy(false);
    const body = (await res.json().catch(() => ({}))) as OtpResponse;
    if (!res.ok) {
      const wait = body.details?.retryAfterSeconds;
      if (wait && wait < 120) setCooldown(wait);
      if (body.error === "TOO_MANY_REQUESTS") setLimited(true);
      if (body.error === "INVALID_PHONE") return setPhoneError(ERRORS.INVALID_PHONE!);
      return setBanner(ERRORS[body.error ?? ""] ?? "Something went wrong. Try again.");
    }
    setCode("");
    setLocked(false);
    setMessage(opts.notice ? { text: opts.notice, tone: "info" } : null);
    setCooldown(30);
    setStep({ kind: "code", phone: normalized, sentTo: body.sentTo!, channel: body.channel!, devCode: body.devCode });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== "code" || code.length !== 6) return;
    setBusy(true);
    setMessage(null);
    setBanner(null);
    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: step.phone, code }),
    });
    const body = (await res.json().catch(() => ({}))) as OtpResponse;
    if (res.ok) {
      // A first sign-in lands on the optional welcome; anyone heading somewhere specific goes straight there.
      router.replace(body.isNewUser && next === "/" ? "/welcome" : next);
      router.refresh();
      return;
    }
    setBusy(false);
    if (body.error === "EXPIRED") {
      // The old code is dead, so send a fresh one rather than make them ask.
      setCode("");
      return void sendCode(step.channel === "SMS" ? "SMS" : "WHATSAPP", { notice: "That code expired. We've sent a new one." });
    }
    setCode("");
    if (body.error === "TOO_MANY_ATTEMPTS" || body.details?.attemptsLeft === 0) {
      setLocked(true);
      setCooldown(0);
      return setMessage({ text: ERRORS.TOO_MANY_ATTEMPTS!, tone: "error" });
    }
    const left = body.details?.attemptsLeft;
    setMessage({
      text:
        body.error === "WRONG_CODE" && left !== undefined
          ? `That code didn't match. ${left} ${left === 1 ? "try" : "tries"} left.`
          : (ERRORS[body.error ?? ""] ?? "Something went wrong. Try again."),
      tone: "error",
    });
  }

  const bannerEl = banner && (
    <div role="alert" className="flex items-start gap-2.5 rounded-md bg-surface-2 px-3.5 py-3">
      <CircleAlert aria-hidden className="ic mt-px text-danger" strokeWidth={ICON_STROKE} />
      <span className="t-small font-semibold">{banner}</span>
    </div>
  );

  if (step.kind === "phone") {
    return (
      <form
        className="flex flex-col gap-3.5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void sendCode();
        }}
      >
        {bannerEl}
        <PhoneInput value={phone} onChange={(v) => (setPhone(v), setPhoneError(null))} error={phoneError} hint={PHONE_HINT} autoFocus />
        <Button type="submit" size="lg" block loading={busy} disabled={limited}>
          <MessageCircle aria-hidden className="ic" strokeWidth={ICON_STROKE} />
          Send code on WhatsApp
        </Button>
        <Legal />
      </form>
    );
  }

  const waiting = cooldown > 0;
  return (
    <form className="flex flex-col gap-3.5" onSubmit={verify} noValidate>
      {bannerEl}
      <p className="t-small">
        Code sent on {step.channel === "SMS" ? "SMS" : "WhatsApp"} to <strong>{step.sentTo}</strong> ·{" "}
        <button type="button" className="btn btn-ghost btn-sm !h-6 !p-0 !text-[13px]" onClick={() => setStep({ kind: "phone" })}>
          Change
        </button>
      </p>
      {step.devCode && (
        <p className="t-small rounded-md border border-dashed border-line p-2.5 text-muted">
          Development: your code is <span className="t-mono font-semibold">{step.devCode}</span>
        </p>
      )}
      <OtpInput
        value={code}
        onChange={(v) => (setCode(v), message?.tone === "error" && !locked && setMessage(null))}
        invalid={message?.tone === "error"}
        disabled={locked}
        describedBy={message ? messageId : undefined}
        autoFocus
      />
      <p id={messageId} role="status" className={message?.tone === "error" ? "help err" : "help"}>
        {message?.text}
      </p>
      <Button type="submit" size="lg" block loading={busy} disabled={code.length !== 6 || locked}>
        Sign in
      </Button>
      <div className="flex min-h-11 items-center justify-between gap-3">
        {waiting ? (
          <span className="t-small muted">
            Resend in <span className="t-mono !text-[13px]">{clock(cooldown)}</span>
          </span>
        ) : (
          <Button variant="ghost" size="sm" className="!p-0" disabled={busy || limited} onClick={() => sendCode(step.channel === "SMS" ? "SMS" : "WHATSAPP")}>
            Resend code
          </Button>
        )}
        <Button variant="ghost" size="sm" className="!p-0" disabled={waiting || busy || limited || step.channel === "SMS"} onClick={() => sendCode("SMS")}>
          Send by SMS instead
        </Button>
      </div>
    </form>
  );
}

function Legal() {
  return (
    <p className="t-caption muted !font-medium !leading-4">
      No passwords. By continuing you agree to YOLT&apos;s{" "}
      <Link href="/legal/terms" className="font-semibold">
        Terms
      </Link>{" "}
      and{" "}
      <Link href="/legal/privacy" className="font-semibold">
        Privacy
      </Link>
      .
    </p>
  );
}
