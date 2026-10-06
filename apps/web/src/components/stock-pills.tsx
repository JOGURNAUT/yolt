import Link from "next/link";
import { STOCK_FILTERS, type StockFilter } from "@/lib/server/queries";

/**
 * StockPills (board C1): count in each pill, the choice kept in the URL as ?status=.
 * `hrefFor` replaces the default link for pages that carry other parameters (search filters).
 */
export function StockPills({
  basePath,
  active,
  counts,
  hrefFor,
}: {
  basePath: string;
  active: StockFilter;
  counts: Record<StockFilter, number>;
  hrefFor?: (value: StockFilter) => string;
}) {
  return (
    <nav aria-label="Filter by availability" className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1">
      {STOCK_FILTERS.map((f) => {
        const selected = f.value === active;
        return (
          <Link
            key={f.value}
            href={hrefFor ? hrefFor(f.value) : f.value === "in-stock" ? basePath : `${basePath}?status=${f.value}`}
            aria-current={selected ? "page" : undefined}
            scroll={false}
            className={`pill min-h-11 shrink-0${selected ? " is-active" : ""}`}
          >
            {f.label} <span className="n">{counts[f.value]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
