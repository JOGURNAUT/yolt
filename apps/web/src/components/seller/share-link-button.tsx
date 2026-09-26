"use client";

import { useState } from "react";
import { sellerShareUrl } from "@yolt/shared";

/**
 * Copies a link that credits the seller (decision D16): buyers who first arrive through it
 * are the seller's own for 30 days, with no commission on their orders.
 */
export function ShareLinkButton({ path, sellerHandle, label = "Copy share link" }: { path: string; sellerHandle: string; label?: string }) {
  const [copied, setCopied] = useState(false);

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
    <button type="button" onClick={copy} className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-foreground">
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}
