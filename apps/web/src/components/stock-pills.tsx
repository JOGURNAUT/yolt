import Link from "next/link";
import { STOCK_FILTERS, type StockFilter } from "@/lib/server/queries";

export function StockPills({
  basePath,
  active,
  counts,
}: {
  basePath: string;
  active: StockFilter;
  counts: Record<StockFilter, number>;
}) {
  return (
    <nav aria-label="Filter by availability" className="flex gap-2 overflow-x-auto pb-1">
      {STOCK_FILTERS.map((f) => {
        const selected = f.value === active;
        return (
          <Link
            key={f.value}
            href={f.value === "in-stock" ? basePath : `${basePath}?status=${f.value}`}
            aria-current={selected ? "page" : undefined}
            scroll={false}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium ${
              selected ? "border-foreground bg-foreground text-background" : "border-line hover:border-foreground"
            }`}
          >
            {f.label} <span className={selected ? "opacity-80" : "text-muted"}>{counts[f.value]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
