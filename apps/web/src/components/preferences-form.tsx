"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BUYER_STYLES, MAX_PREFERENCE_SIZES, normalizeSize } from "@yolt/shared";
import { Button } from "./ui/button";
import { cx } from "./ui/cx";

/** Chips offer what listings are tagged with: "Waist 30" stands for the tag "W30". */
const SIZE_CHIPS = [
  { label: "XS", value: "XS" },
  { label: "S", value: "S" },
  { label: "M", value: "M" },
  { label: "L", value: "L" },
  { label: "XL", value: "XL" },
  { label: "Waist 28", value: "W28" },
  { label: "Waist 30", value: "W30" },
  { label: "Waist 32", value: "W32" },
  { label: "UK 7", value: "UK 7" },
  { label: "UK 8", value: "UK 8" },
];

const BUDGETS = [
  { label: "Under ₹499", paise: 49_900 },
  { label: "Under ₹999", paise: 99_900 },
  { label: "Under ₹1,999", paise: 199_900 },
  { label: "Any", paise: null },
] as const;

type Initial = { sizes: string[]; styles: string[]; maxBudgetPaise: number | null };

/**
 * Preferences (board B2.4): optional and skippable. Saved with PUT /api/me/preferences; sending
 * nothing selected clears them. Sizes saved earlier that aren't in the chip list stay as chips.
 */
export function PreferencesForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [styles, setStyles] = useState<string[]>(initial.styles);
  const [sizes, setSizes] = useState<string[]>(initial.sizes);
  const [budget, setBudget] = useState<number | null>(initial.maxBudgetPaise);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chips = [...SIZE_CHIPS, ...initial.sizes.filter((s) => !SIZE_CHIPS.some((c) => c.value === s)).map((s) => ({ label: s, value: s }))];
  const full = sizes.length >= MAX_PREFERENCE_SIZES;
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/me/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sizes: sizes.map(normalizeSize), styles, maxBudgetPaise: budget }),
    }).catch(() => null);
    if (res?.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    setBusy(false);
    setError(res?.status === 401 ? "Your session ended. Sign in again to save." : "We couldn't save that. Try again.");
  }

  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="sticker paper">Optional</span>
        <Link href="/" className="btn btn-ghost btn-md">
          Skip
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="t-display">What should we show you first?</h1>
        <p className="t-small muted">
          Your sizes power the “In your sizes” row on your home, and you&apos;ll still see everything. Styles and budget are saved, but only sizes change what you see today. Change them any time.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2.5 border-0 p-0">
        <legend className="t-h2 mb-2.5 p-0">Styles you like</legend>
        <div className="flex flex-wrap gap-2">
          {BUYER_STYLES.map((s) => (
            <button key={s} type="button" aria-pressed={styles.includes(s)} onClick={() => setStyles(toggle(styles, s))} className={cx("pill !h-11", styles.includes(s) && "is-active")}>
              {s}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2.5 border-0 p-0">
        <legend className="t-h2 mb-2.5 p-0">Your sizes</legend>
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => {
            const on = sizes.includes(c.value);
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => setSizes(toggle(sizes, c.value))}
                className={cx("pill !h-11 min-w-[52px] justify-center disabled:opacity-40", on && "is-active")}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <span className="t-caption muted">Tag sizes vary between brands. Every piece also shows real measurements. Up to {MAX_PREFERENCE_SIZES} sizes.</span>
      </fieldset>

      <fieldset className="flex flex-col gap-2.5 border-0 p-0">
        <legend className="t-h2 mb-2.5 p-0">Usual budget per piece</legend>
        <div className="flex flex-wrap gap-2">
          {BUDGETS.map((b) => {
            const on = budget === b.paise;
            return (
              <button key={b.label} type="button" aria-pressed={on} onClick={() => setBudget(on ? null : b.paise)} className={cx("pill !h-11", on && "is-active")}>
                {b.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="help err">
          {error}
        </p>
      )}
      <Button size="lg" block loading={busy} onClick={save}>
        Show my feed
      </Button>
    </div>
  );
}
