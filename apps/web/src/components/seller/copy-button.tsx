"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cx, ICON_STROKE } from "@/components/ui/cx";

/** Copies text (e.g. the delivery address for a courier form) and says so. */
export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this text", text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button type="button" onClick={copy} className={cx("btn btn-sm btn-secondary !h-11", className)}>
      {copied ? <Check aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} /> : <Copy aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}
