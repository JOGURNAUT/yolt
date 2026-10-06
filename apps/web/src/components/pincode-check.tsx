"use client";

import { useState } from "react";
import { CircleAlert, Truck } from "lucide-react";
import { isValidPincode } from "@yolt/shared";
import { Button } from "./ui/button";
import { ICON_STROKE } from "./ui/cx";

type Result = { serviceable: true; etaDaysMin: number; etaDaysMax: number } | { serviceable: false; reason?: string };

/**
 * PincodeCheck (board Product): "Delivers to 411001 in 3–5 days", before anyone commits. States:
 * idle (a hint), checking, deliverable, not deliverable, invalid pincode, and the check failing.
 * Each outcome has an icon and words, never colour alone.
 */
export function PincodeCheck({ listingId }: { listingId: string }) {
  const [pincode, setPincode] = useState("");
  const [checked, setChecked] = useState<{ pincode: string; result: Result } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidPincode(pincode)) {
      setChecked(null);
      return setError("Enter a 6-digit pincode.");
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shipping/check?listingId=${listingId}&pincode=${pincode}`);
      if (!res.ok) return setError("Couldn't check delivery right now. Try again in a moment.");
      setChecked({ pincode, result: (await res.json()) as Result });
    } catch {
      setError("Couldn't check delivery right now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={check} className="flex flex-col gap-2" noValidate>
      <div className="flex items-end gap-2">
        <label className="field">
          Pincode
          <input
            className="input !h-12 !w-40"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            aria-label="Delivery pincode"
            aria-invalid={error ? true : undefined}
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
          />
        </label>
        <Button type="submit" variant="secondary" loading={busy}>
          Check delivery
        </Button>
      </div>
      <p role="status" aria-live="polite" className="t-small flex items-start gap-1.5 empty:hidden">
        {error ? (
          <>
            <CircleAlert aria-hidden className="ic ic-16 mt-0.5 text-danger" strokeWidth={ICON_STROKE} />
            <span className="font-semibold text-danger">{error}</span>
          </>
        ) : checked ? (
          checked.result.serviceable ? (
            <>
              <Truck aria-hidden className="ic ic-16 mt-0.5 text-success" strokeWidth={ICON_STROKE} />
              <span className="font-semibold text-success">
                Delivers to {checked.pincode} in {checked.result.etaDaysMin}–{checked.result.etaDaysMax} days after dispatch.
              </span>
            </>
          ) : (
            <>
              <CircleAlert aria-hidden className="ic ic-16 mt-0.5 text-danger" strokeWidth={ICON_STROKE} />
              <span className="font-semibold text-danger">We can&apos;t deliver to {checked.pincode} yet.</span>
            </>
          )
        ) : (
          <span className="muted font-medium">Enter your pincode to see when it would arrive.</span>
        )}
      </p>
    </form>
  );
}
