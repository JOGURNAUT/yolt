"use client";

import { usePathname, useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Lock } from "lucide-react";
import { SellerDialog } from "@/components/seller/seller-dialog";
import { Button } from "@/components/ui/button";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { type AdminResult, reasonOk } from "./admin-api";

export const REASON_ERROR = "Write a reason (at least 5 characters). It goes in the audit log.";

/** Signs the staff member out and back in, then returns them to the page they were on. */
export function ReauthButton({ next }: { next?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" });
        router.push(`/login?next=${encodeURIComponent(next ?? pathname ?? "/admin")}`);
      }}
    >
      Sign in again
    </Button>
  );
}

/** An API failure. A session older than 12 hours gets the re-auth prompt instead of a bare error. */
export function AdminError({ failure, className }: { failure: Extract<AdminResult, { ok: false }> | null; className?: string }) {
  if (!failure) return null;
  const reauth = failure.error === "REAUTH_REQUIRED" || failure.error === "SIGN_IN_REQUIRED";
  return (
    <div role="alert" className={cx("t-small flex flex-wrap items-center gap-x-3 gap-y-2 font-semibold text-danger", className)}>
      <span>{failure.message}</span>
      {reauth && <ReauthButton />}
    </div>
  );
}

/** Shown where write controls would be, for staff whose role can only look. */
export function ReadOnlyNote({ children = "Read-only: SUPPORT staff can look but not change." }: { children?: React.ReactNode }) {
  return (
    <p className="t-small muted flex items-center gap-2">
      <Lock aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />
      {children}
    </p>
  );
}

/** A required reason for the audit log. `error` turns the field red and is read out with it. */
export function ReasonField({
  value,
  onChange,
  error,
  label = "Reason",
  placeholder = "What did you check, and why this decision?",
  help = "Shown in the audit log with your name. At least 5 characters.",
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  label?: string;
  placeholder?: string;
  help?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        className="input !h-auto min-h-[84px] !py-3 !leading-[1.4]"
        maxLength={1000}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-help`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span id={`${id}-help`} className={cx("help", error && "err")}>
        {error ?? help}
      </span>
    </div>
  );
}

function ReasonForm({
  intro,
  confirmLabel,
  tone,
  onSubmit,
  onClose,
  children,
}: {
  intro?: React.ReactNode;
  confirmLabel: string;
  tone: "primary" | "danger";
  onSubmit: (reason: string) => Promise<AdminResult>;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [failure, setFailure] = useState<Extract<AdminResult, { ok: false }> | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!reasonOk(reason)) return setReasonError(REASON_ERROR);
        setReasonError(null);
        setFailure(null);
        setBusy(true);
        const r = await onSubmit(reason.trim());
        setBusy(false);
        if (!r.ok) setFailure(r);
      }}
    >
      {intro && <div className="t-body muted">{intro}</div>}
      {children}
      <ReasonField
        value={reason}
        onChange={(v) => {
          setReason(v);
          if (reasonOk(v)) setReasonError(null);
        }}
        error={reasonError}
      />
      <AdminError failure={failure} />
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="submit" variant={tone} size="lg" loading={busy} className="sm:flex-1">
          {confirmLabel}
        </Button>
        <Button variant="secondary" size="lg" onClick={onClose} className="sm:flex-1">
          Not now
        </Button>
      </div>
    </form>
  );
}

/**
 * A modal that asks for the reason before a staff write. `onSubmit` makes the API call; the dialog
 * stays open and shows the error if it fails, so the reason isn't lost.
 */
export function ReasonDialog({
  open,
  onClose,
  title,
  intro,
  confirmLabel,
  tone = "primary",
  onSubmit,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  intro?: React.ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  onSubmit: (reason: string) => Promise<AdminResult>;
  children?: React.ReactNode;
}) {
  return (
    <SellerDialog open={open} onClose={onClose} title={title}>
      <ReasonForm
        intro={intro}
        confirmLabel={confirmLabel}
        tone={tone}
        onClose={onClose}
        onSubmit={async (reason) => {
          const r = await onSubmit(reason);
          if (r.ok) onClose();
          return r;
        }}
      >
        {children}
      </ReasonForm>
    </SellerDialog>
  );
}

