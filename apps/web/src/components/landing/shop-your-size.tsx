"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { searchParamsToQuery, type MeasurementFilter } from "@yolt/shared";

/** The chips the board offers. The value is what listings carry as their tag size ("W30"), the label what buyers say. */
const SIZES = [
  { label: "S", value: "S" },
  { label: "M", value: "M" },
  { label: "L", value: "L" },
  { label: "XL", value: "XL" },
  { label: "Waist 30", value: "W30" },
  { label: "UK 8", value: "UK 8" },
] as const;

/** Whole centimetres only; anything else counts as empty. */
const cm = (v: string) => (/^\d{2,3}$/.test(v) ? Number(v) : null);

/**
 * Shop your size (board B2.1 §7): the tape-measure module. It links to the existing search URL
 * (`size=` for a tag size, `chest=`/`waist=` in cm for measurements, compared all the way around),
 * so the result page is the normal, shareable search.
 */
export function ShopYourSize({ className }: { className?: string }) {
  const [mode, setMode] = useState<"size" | "measure">("size");
  const [size, setSize] = useState<string>("M");
  const [chest, setChest] = useState("");
  const [waist, setWaist] = useState("");

  const measurements: Partial<Record<MeasurementFilter, { min: number }>> = {};
  if (cm(chest)) measurements.chest = { min: cm(chest)! };
  if (cm(waist)) measurements.waist = { min: cm(waist)! };
  const ready = mode === "size" || Object.keys(measurements).length > 0;
  const href = `/search${mode === "size" ? searchParamsToQuery({ sizes: [size] }) : searchParamsToQuery({ measurements })}`;

  const toggle = (m: "size" | "measure", label: string) => (
    <button type="button" className={m === mode ? "is-on" : undefined} aria-pressed={m === mode} onClick={() => setMode(m)}>
      {label}
    </button>
  );

  return (
    <section id="shop-your-size" aria-labelledby="size-h" className={cx("card flex scroll-mt-28 flex-col overflow-hidden", className)}>
      <div aria-hidden="true" className="tape !rounded-none">
        <div className="nums">
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i}>{i * 10}</span>
          ))}
        </div>
      </div>
      <div className="grid grow gap-5 p-4 py-[18px] lg:grid-cols-[1fr_180px] lg:px-6 lg:py-[22px]">
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1">
            <h2 id="size-h" className="t-h1">
              Shop your size
            </h2>
            <p className="t-small muted">Pick a tag size, or enter your measurements. Pieces are measured flat; we compare all the way around for you.</p>
          </div>
          <div role="group" aria-label="Find by" className="seg self-start [&_button]:!h-11 [&_button]:!px-4">
            {toggle("size", "Tag size")}
            {toggle("measure", "Measurements")}
          </div>
          {mode === "size" ? (
            <div role="group" aria-label="Sizes" className="flex flex-wrap gap-2">
              {SIZES.map((z) => (
                <button key={z.value} type="button" aria-pressed={size === z.value} onClick={() => setSize(z.value)} className={cx("pill !h-11", size === z.value && "is-active")}>
                  {z.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  ["Chest, around you", chest, setChest],
                  ["Waist, around you", waist, setWaist],
                ] as const
              ).map(([label, value, set]) => (
                <label key={label} className="field">
                  {label}
                  <span className="relative">
                    <input className="input pr-11" inputMode="numeric" autoComplete="off" maxLength={3} value={value} onChange={(e) => set(e.target.value.replace(/\D/g, ""))} />
                    <span aria-hidden="true" className="t-small muted absolute right-3.5 top-[17px]">
                      cm
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {ready ? (
              <Link href={href} className={buttonClass({ size: "md" }, "w-full lg:w-auto lg:self-start")}>
                Measured pieces that fit
              </Link>
            ) : (
              <button type="button" disabled className={buttonClass({ size: "md" }, "w-full lg:w-auto lg:self-start")}>
                Measured pieces that fit
              </button>
            )}
            {mode === "measure" && <p className="help">Shows pieces measured at least this wide, all the way around.</p>}
          </div>
        </div>
        <svg viewBox="0 0 120 120" aria-hidden="true" className="hidden h-[180px] w-[180px] self-center fill-none stroke-foreground lg:block" strokeLinejoin="round" strokeLinecap="round">
          <path d="M34 12 L78 12 L82 110 L64 110 L56 50 L48 110 L30 110 Z M34 20 L78 20" strokeOpacity=".45" strokeWidth="1.6" />
          <path d="M34 6 L78 6 M34 2 L34 10 M78 2 L78 10 M96 12 L96 110 M92 12 L100 12 M92 110 L100 110" strokeWidth="1.6" />
        </svg>
      </div>
    </section>
  );
}
