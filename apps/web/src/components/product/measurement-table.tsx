"use client";

import { useState } from "react";

export type MeasurementRow = { key: string; label: string; how: string | null; cm: number };

const fmt = (cm: number, unit: "cm" | "in") => (unit === "cm" ? `${cm} cm` : `${(cm / 2.54).toFixed(1)} in`);

/**
 * MeasurementTable (board C5): the tag size, then each measurement in cm or inches, and the exact
 * note on whether chest, waist and hip were measured flat or all the way around.
 */
export function MeasurementTable({ tagSize, rows, basis }: { tagSize: string | null; rows: MeasurementRow[]; basis: "FLAT" | "AROUND" | undefined }) {
  const [unit, setUnit] = useState<"cm" | "in">("cm");
  return (
    <section aria-labelledby="measure-h" className="card overflow-hidden">
      <h2 id="measure-h" className="sr-only">
        Measurements
      </h2>
      <div className="tape !h-6 !rounded-none" style={{ backgroundSize: "100% 10px, 100% 5px" }} aria-hidden="true" />
      <div className="flex flex-col gap-1 px-4 py-3.5 lg:px-[18px]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="t-caption muted">Tag size</span>
            <span className="t-h3">{tagSize ?? "Not stated"}</span>
          </div>
          {rows.length > 0 && (
            <div className="seg [&_button]:min-h-11" role="group" aria-label="Units">
              {(["cm", "in"] as const).map((u) => (
                <button key={u} type="button" className={unit === u ? "is-on" : undefined} aria-pressed={unit === u} onClick={() => setUnit(u)}>
                  {u}
                </button>
              ))}
            </div>
          )}
        </div>
        {rows.length > 0 ? (
          <>
            <dl>
              {rows.map((r) => (
                <div key={r.key} className="flex items-baseline justify-between gap-3 py-[9px] shadow-[inset_0_-1px_0_var(--line)]">
                  <dt className="t-body">
                    {r.label} {r.how && <span className="t-small muted">{r.how}</span>}
                  </dt>
                  <dd className="t-mono !font-medium">{fmt(r.cm, unit)}</dd>
                </div>
              ))}
            </dl>
            {basis && (
              <p className="t-small muted mt-2">
                {basis === "FLAT"
                  ? "Measured flat, one side. Double chest, waist and hip to compare with a tape measure around you."
                  : "Measured all the way around."}
              </p>
            )}
          </>
        ) : (
          <p className="t-small muted mt-1">The seller hasn&apos;t added measurements for this item.</p>
        )}
      </div>
    </section>
  );
}
