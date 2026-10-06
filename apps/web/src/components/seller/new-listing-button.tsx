"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ICON_STROKE } from "@/components/ui/cx";

export function NewListingButton({ className, label = "New listing" }: { className?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function create() {
    setBusy(true);
    setFailed(false);
    const res = await fetch("/api/seller/listings", { method: "POST" });
    if (res.ok) {
      const { id } = (await res.json()) as { id: string };
      router.push(`/seller/listings/${id}`);
    } else {
      setBusy(false);
      setFailed(true);
    }
  }
  return (
    <>
      <Button onClick={create} loading={busy} className={className}>
        <Plus aria-hidden className="ic" strokeWidth={ICON_STROKE} />
        {label}
      </Button>
      {failed && (
        <span role="alert" className="t-small text-danger">
          Couldn&apos;t start a listing. Try again.
        </span>
      )}
    </>
  );
}
