import { useId } from "react";
import { cx } from "./cx";

/** Digits only, without a pasted +91 or leading 0, at most 10, grouped as 98765 43210. */
export function formatPhoneInput(raw: string) {
  let d = raw.replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
  if (d.length > 10 && d.startsWith("0")) d = d.slice(1);
  d = d.slice(0, 10);
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
}

/**
 * PhoneInput (board C1): a +91 prefix and the number. The label is the field's name; the hint or
 * the error sits below and is read with the field.
 */
export function PhoneInput({
  label = "Mobile number",
  value,
  onChange,
  hint,
  error,
  disabled,
  autoFocus,
  className,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div className={cx("field", className)}>
      <label htmlFor={id}>{label}</label>
      <div className={cx("phone", error && "is-error")}>
        <span className="cc" aria-hidden="true">
          +91
        </span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="98765 43210"
          value={value}
          disabled={disabled}
          data-autofocus={autoFocus ? "" : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={helpId}
          onChange={(e) => onChange(formatPhoneInput(e.target.value))}
        />
      </div>
      <span id={helpId} className={cx("help", error && "err")}>
        {error ?? hint}
      </span>
    </div>
  );
}
