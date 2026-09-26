"use client";

import { useState } from "react";
import { isValidPincode } from "@yolt/shared";

type Result = { serviceable: true; etaDaysMin: number; etaDaysMax: number } | { serviceable: false; reason?: string };

/** "Delivers to 411001 in 3–5 days", shown on the product page before anyone commits. */
export function PincodeCheck({ listingId }: { listingId: string }) {
  const [pincode, setPincode] = useState("");
  const [checked, setChecked] = useState<{ pincode: string; result: Result } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidPincode(pincode)) return setError("Enter a 6-digit pincode.");
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/shipping/check?listingId=${listingId}&pincode=${pincode}`);
    setBusy(false);
    if (!res.ok) return setError("Couldn't check delivery right now.");
    setChecked({ pincode, result: (await res.json()) as Result });
  }

  return (
    <form onSubmit={check} className="space-y-1">
      <div className="flex gap-2">
        <input
          className="w-32 rounded-md border border-line bg-background px-3 py-2"
          inputMode="numeric"
          maxLength={6}
          placeholder="Pincode"
          aria-label="Delivery pincode"
          value={pincode}
          onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
        />
        <button type="submit" disabled={busy} className="rounded-md border border-line px-3 py-2 hover:border-foreground disabled:opacity-50">
          {busy ? "Checking…" : "Check delivery"}
        </button>
      </div>
      <p role="status" aria-live="polite" className="text-sm">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : checked ? (
          checked.result.serviceable ? (
            `Delivers to ${checked.pincode} in ${checked.result.etaDaysMin}–${checked.result.etaDaysMax} days after dispatch.`
          ) : (
            <span className="text-danger">We can&apos;t deliver to {checked.pincode} yet.</span>
          )
        ) : null}
      </p>
    </form>
  );
}
