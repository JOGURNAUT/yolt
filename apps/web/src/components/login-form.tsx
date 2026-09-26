"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { normalizeIndianMobile } from "@yolt/shared";

type Step = { kind: "phone" } | { kind: "code"; phone: string; sentTo: string; channel: string; devCode?: string };

const ERRORS: Record<string, string> = {
  INVALID_PHONE: "Enter a 10-digit Indian mobile number.",
  RESEND_COOLDOWN: "Please wait a few seconds before asking for another code.",
  TOO_MANY_REQUESTS: "Too many codes requested. Try again in an hour.",
  OTP_DELIVERY_FAILED: "We couldn't send the code right now. Try again in a minute.",
  EXPIRED: "That code has expired. Ask for a new one.",
  TOO_MANY_ATTEMPTS: "Too many wrong tries. Ask for a new code.",
};

type OtpResponse = {
  error?: string;
  details?: { retryAfterSeconds?: number; attemptsLeft?: number };
  sentTo?: string;
  channel?: string;
  devCode?: string;
};

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(channel: "WHATSAPP" | "SMS" = "WHATSAPP") {
    const normalized = normalizeIndianMobile(step.kind === "code" ? step.phone : phone);
    if (!normalized) return setError(ERRORS.INVALID_PHONE!);
    setBusy(true);
    setError(null);
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
      return setError(ERRORS[body.error ?? ""] ?? "Something went wrong. Try again.");
    }
    setCode("");
    setCooldown(30);
    setStep({ kind: "code", phone: normalized, sentTo: body.sentTo!, channel: body.channel!, devCode: body.devCode });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== "code") return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: step.phone, code }),
    });
    const body = (await res.json().catch(() => ({}))) as OtpResponse;
    if (res.ok) {
      router.replace(next);
      router.refresh();
      return;
    }
    setBusy(false);
    const left = body.details?.attemptsLeft;
    setError(
      body.error === "WRONG_CODE"
        ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`
        : (ERRORS[body.error ?? ""] ?? "Something went wrong. Try again."),
    );
  }

  const field = "w-full rounded-md border border-line bg-background px-3 py-3 text-lg";
  const primary = "w-full rounded-full bg-foreground py-3 font-semibold text-background disabled:opacity-50";

  if (step.kind === "phone") {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void sendCode();
        }}
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium">Mobile number</span>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-line px-3 py-3 text-lg text-muted">+91</span>
            <input
              className={field}
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
            />
          </div>
        </label>
        <button type="submit" disabled={busy} className={primary}>
          {busy ? "Sending…" : "Send code on WhatsApp"}
        </button>
        <p role="alert" aria-live="polite" className="text-sm text-danger">
          {error}
        </p>
      </form>
    );
  }

  return (
    <form className="space-y-4" onSubmit={verify}>
      <p className="text-sm">
        Code sent on {step.channel === "SMS" ? "SMS" : "WhatsApp"} to <span className="font-medium">{step.sentTo}</span>.{" "}
        <button type="button" className="underline" onClick={() => setStep({ kind: "phone" })}>
          Change number
        </button>
      </p>
      {step.devCode && (
        <p className="rounded-md border border-dashed border-line p-2 text-xs text-muted">
          Development: your code is <span className="font-mono font-semibold">{step.devCode}</span>
        </p>
      )}
      <label className="block space-y-1">
        <span className="text-sm font-medium">6-digit code</span>
        <input
          className={`${field} tracking-[0.4em]`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          autoFocus
        />
      </label>
      <button type="submit" disabled={busy || code.length !== 6} className={primary}>
        {busy ? "Checking…" : "Sign in"}
      </button>
      <p role="alert" aria-live="polite" className="text-sm text-danger">
        {error}
      </p>
      <div className="flex justify-between text-sm">
        <button
          type="button"
          disabled={cooldown > 0 || busy}
          onClick={() => sendCode("WHATSAPP")}
          className="underline disabled:no-underline disabled:opacity-50"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
        <button
          type="button"
          disabled={cooldown > 0 || busy}
          onClick={() => sendCode("SMS")}
          className="underline disabled:no-underline disabled:opacity-50"
        >
          Send by SMS instead
        </button>
      </div>
    </form>
  );
}
