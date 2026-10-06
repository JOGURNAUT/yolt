"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cx, ICON_STROKE } from "./cx";
import { IconButton } from "./icon-button";

/**
 * BottomSheet (boards SignIn, Claim): a modal that rises from the bottom on phones and sits centred
 * on desktop. A native <dialog>, so focus stays inside, Escape closes it and the page behind is
 * inert. Mount it while it should be open; `onClose` runs on Escape, the backdrop and the close
 * button. Focus lands on the first `[data-autofocus]` field, else the close button.
 */
export function BottomSheet({
  title,
  description,
  onClose,
  className,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!d.open) d.showModal();
    d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    // No d.close() here: it would fire `close` after a Strict Mode remount and run onClose. Unmounting removes the dialog.
    return () => opener?.focus?.();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="bsheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
    >
      <div className={cx("sheet sheet-body", className)}>
        <div className="handle lg:hidden" aria-hidden="true" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={titleId} className="t-h1">
              {title}
            </h2>
            {description && <div className="t-small muted">{description}</div>}
          </div>
          <IconButton label="Close" plain className="-mr-2.5 -mt-1.5 shrink-0" onClick={() => dialog.current?.close()}>
            <X aria-hidden className="ic ic-24" strokeWidth={ICON_STROKE} />
          </IconButton>
        </div>
        {children}
      </div>
    </dialog>
  );
}
