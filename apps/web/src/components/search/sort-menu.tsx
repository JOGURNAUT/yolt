"use client";

import { ArrowUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { ICON_STROKE } from "@/components/ui/cx";
import "@/styles/search.css";

/**
 * SortMenu (board Search): a button-sized label over a native select, so phones get their own
 * picker and keyboards work without extra code. Each option is a full URL, so sorting stays in the link.
 */
export function SortMenu({ current, options }: { current: string; options: { value: string; label: string; href: string }[] }) {
  const router = useRouter();
  const label = options.find((o) => o.value === current)?.label ?? options[0]!.label;
  return (
    <label className="sortbtn">
      <ArrowUpDown aria-hidden className="ic ic-16" strokeWidth={ICON_STROKE} />
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">Sort by</span>
      <select
        value={current}
        onChange={(e) => {
          const o = options.find((x) => x.value === e.target.value);
          if (o) router.push(o.href, { scroll: false });
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
