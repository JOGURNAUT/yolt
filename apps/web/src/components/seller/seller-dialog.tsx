"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx, ICON_STROKE } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/icon-button";

/**
 * A modal on the native <dialog>: focus stays inside, Escape and a tap on the backdrop close it, and
 * focus returns to the button that opened it. A sheet from the bottom on phones, a card on desktop.
 */
export function SellerDialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sdialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="panel">
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="t-h1">
              {title}
            </h2>
            <IconButton label="Close" plain onClick={onClose} className="-mr-2 -mt-2">
              <X aria-hidden className="ic ic-24" strokeWidth={ICON_STROKE} />
            </IconButton>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** A yes/no question with one clear action. `error` is announced when the action fails. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = "primary",
  busy = false,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <SellerDialog open={open} onClose={onClose} title={title}>
      <div className="t-body muted">{children}</div>
      <p role="alert" className={cx("t-small text-danger", !error && "hidden")}>
        {error}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button variant={tone} size="lg" loading={busy} onClick={onConfirm} className="sm:flex-1">
          {confirmLabel}
        </Button>
        <Button variant="secondary" size="lg" onClick={onClose} className="sm:flex-1">
          Not now
        </Button>
      </div>
    </SellerDialog>
  );
}
