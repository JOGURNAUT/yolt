"use client";

import { useId, useState } from "react";
import { cx } from "./cx";

/**
 * OtpInput (board C1): six cells drawn over one real input, so typing, paste and the phone's
 * one-time-code autofill all work as they do in any text field. The cells are decoration; the
 * input carries the name, the invalid state and the message.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  invalid,
  disabled,
  describedBy,
  autoFocus,
  label = `${length}-digit code`,
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  invalid?: boolean;
  disabled?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  label?: string;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      <div className={cx("otp", invalid && "is-error")} aria-hidden="true">
        {Array.from({ length }, (_, i) => (
          <span key={i} className={cx("cell", focused && !disabled && i === Math.min(value.length, length - 1) && "is-active")}>
            {value[i] ?? ""}
          </span>
        ))}
      </div>
      <input
        id={id}
        aria-label={label}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        value={value}
        disabled={disabled}
        data-autofocus={autoFocus ? "" : undefined}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
        onSelect={(e) => {
          // Keep the caret at the end: the cells have no per-digit editing.
          const el = e.currentTarget;
          if (el.selectionStart !== el.value.length) el.setSelectionRange(el.value.length, el.value.length);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 size-full cursor-text border-0 opacity-0"
      />
    </div>
  );
}
