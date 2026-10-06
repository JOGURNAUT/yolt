import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { cx, ICON_STROKE } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type Style = { variant?: ButtonVariant; size?: ButtonSize; block?: boolean };

/** Class names for a Button, for elements that can't be one (e.g. a form's submit link). */
export function buttonClass({ variant = "primary", size = "md", block = false }: Style = {}, className?: string) {
  return cx("btn", `btn-${variant}`, `btn-${size}`, block && "btn-block", className);
}

/**
 * Button (board C1). One primary per view. `sm` (40 px) is for pointer devices only.
 * Loading keeps the width and the label (for screen readers) and shows a spinner over it.
 */
export function Button({
  variant,
  size,
  block,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: Style & { loading?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, block }, className)}
      {...props}
    >
      {loading ? (
        <>
          <span className="opacity-0">{children}</span>
          <LoaderCircle aria-hidden className="ic ic-16 spin absolute" strokeWidth={ICON_STROKE} />
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** A link that looks like a Button. */
export function ButtonLink({
  variant,
  size,
  block,
  className,
  ...props
}: Style & React.ComponentProps<typeof Link>) {
  return <Link className={buttonClass({ variant, size, block }, className)} {...props} />;
}
