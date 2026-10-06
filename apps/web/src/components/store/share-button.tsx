"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ICON_STROKE } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/icon-button";
import { Toast } from "@/components/ui/toast";

/**
 * Share (boards C4, Product): the phone's share sheet where there is one, otherwise the link is
 * copied. The link is the page without any filters. An icon on phones, a labelled button on desktop.
 */
export function ShareButton({ title, label = "Share store", iconOnly = false }: { title: string; label?: string; iconOnly?: boolean }) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  async function share() {
    const url = `${window.location.origin}${window.location.pathname}`;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        setMessage("Link copied");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMessage("Couldn't share. Copy the link from the address bar.");
    }
  }

  return (
    <>
      <IconButton label={label} onClick={share} className={iconOnly ? undefined : "lg:hidden"}>
        <Share2 aria-hidden className="ic" strokeWidth={ICON_STROKE} />
      </IconButton>
      {!iconOnly && (
        <Button variant="secondary" onClick={share} className="hidden lg:inline-flex">
          <Share2 aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />
          {label}
        </Button>
      )}
      {message && (
        <Toast tone="info" className="fixed inset-x-4 bottom-[calc(var(--bnav-h)+16px)] z-40 mx-auto max-w-sm">
          {message}
        </Toast>
      )}
    </>
  );
}
