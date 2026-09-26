"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewListingButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    const res = await fetch("/api/seller/listings", { method: "POST" });
    if (res.ok) {
      const { id } = (await res.json()) as { id: string };
      router.push(`/seller/listings/${id}`);
    } else setBusy(false);
  }
  return (
    <button
      type="button"
      onClick={create}
      disabled={busy}
      className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-60"
    >
      {busy ? "Starting…" : "New listing"}
    </button>
  );
}
