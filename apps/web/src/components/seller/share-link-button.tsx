"use client";

import { useId, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { sellerShareUrl } from "@yolt/shared";
import { cx, ICON_STROKE } from "@/components/ui/cx";

/**
 * Copies a link that credits the seller (decision D16): buyers who first arrive through it
 * are the seller's own for 30 days, with no commission on their orders. `tooltip` explains that on
 * hover and focus, and is read as the button's description.
 */
export function ShareLinkButton({
  path,
  sellerHandle,
  label = "Copy share link",
  tooltip,
  className,
}: {
  path: string;
  sellerHandle: string;
  label?: string;
  tooltip?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const tipId = useId();

  async function copy() {
    const url = sellerShareUrl(window.location.origin, path, sellerHandle);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this link", url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <span className="tip">
      <button type="button" onClick={copy} aria-describedby={tooltip ? tipId : undefined} className={cx("btn btn-sm btn-secondary !h-11", className)}>
        {copied ? <Check aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} /> : <Link2 aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />}
        <span aria-live="polite">{copied ? "Copied" : label}</span>
      </button>
      {tooltip && (
        <span role="tooltip" id={tipId}>
          {tooltip}
        </span>
      )}
    </span>
  );
}
