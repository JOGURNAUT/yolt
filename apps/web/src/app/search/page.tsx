import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { searchListings } from "@yolt/core";
import {
  CATEGORIES,
  CONDITION_INFO,
  CONDITIONS,
  getCategory,
  parseSearchParams,
  searchParamsToQuery,
  SEARCH_STOCK,
  type SearchParams,
} from "@yolt/shared";
import { ProductGrid } from "@/components/product-card";
import { db } from "@/lib/server/db";

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const { q } = parseSearchParams(await searchParams);
  return { title: q ? `“${q}”` : "Search", robots: { index: false } };
}

const STOCK_LABELS = { "in-stock": "In stock", "sold-out": "Sold out", "coming-soon": "Coming soon" } as const;
const SORT_LABELS = { relevance: "Best match", newest: "Newest", price_asc: "Price: low to high", price_desc: "Price: high to low" } as const;
const MEASURE_LABELS = { chest: "Chest", waist: "Waist", hip: "Hip", length: "Length" } as const;

const href = (p: Partial<SearchParams>) => `/search${searchParamsToQuery({ ...p, page: p.page })}`;
const range = (r?: { min?: number; max?: number }) =>
  r?.min !== undefined && r?.max !== undefined ? `${r.min}–${r.max}` : r?.min !== undefined ? `${r.min}+` : `up to ${r?.max}`;

/** One chip per active filter; each link removes just that filter. */
function activeFilters(p: SearchParams) {
  const chips: { label: string; href: string }[] = [];
  for (const c of p.categories) chips.push({ label: getCategory(c)?.label ?? c, href: href({ ...p, categories: p.categories.filter((x) => x !== c), page: 1 }) });
  for (const s of p.sizes) chips.push({ label: `Size ${s}`, href: href({ ...p, sizes: p.sizes.filter((x) => x !== s), page: 1 }) });
  for (const c of p.conditions) chips.push({ label: CONDITION_INFO[c].label, href: href({ ...p, conditions: p.conditions.filter((x) => x !== c), page: 1 }) });
  if (p.price.min !== undefined || p.price.max !== undefined) chips.push({ label: `₹${range(p.price)}`, href: href({ ...p, price: {}, page: 1 }) });
  for (const [k, r] of Object.entries(p.measurements) as [keyof typeof MEASURE_LABELS, { min?: number; max?: number }][]) {
    const rest = { ...p.measurements };
    delete rest[k];
    chips.push({ label: `${MEASURE_LABELS[k]} ${range(r)} cm`, href: href({ ...p, measurements: rest, page: 1 }) });
  }
  if (p.brand) chips.push({ label: `Brand: ${p.brand}`, href: href({ ...p, brand: "", page: 1 }) });
  if (p.store) chips.push({ label: `Store: ${p.store}`, href: href({ ...p, store: "", page: 1 }) });
  return chips;
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  await connection();
  const p = parseSearchParams(await searchParams);
  const r = await searchListings(db, p);
  const chips = activeFilters(p);
  const field = "w-full rounded-md border border-line bg-background px-2 py-1.5 text-sm";

  // A plain GET form: filtering works without JavaScript, e.g. inside Instagram's in-app browser.
  const filterForm = (
      <form action="/search" method="get" className="space-y-5 text-sm">
        {p.q && <input type="hidden" name="q" value={p.q} />}
        {p.stock !== "in-stock" && <input type="hidden" name="status" value={p.stock} />}
        {p.store && <input type="hidden" name="store" value={p.store} />}

        <label className="block space-y-1">
          <span className="font-semibold">Sort</span>
          <select name="sort" defaultValue={p.sort} className={field}>
            {Object.entries(SORT_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="space-y-1">
          <legend className="mb-1 font-semibold">Category</legend>
          {CATEGORIES.filter((c) => p.categories.includes(c.id) || r.categoryCounts.some((x) => x.category === c.id)).map((c) => (
            <label key={c.id} className="flex items-center gap-2">
              <input type="checkbox" name="cat" value={c.id} defaultChecked={p.categories.includes(c.id)} />
              {c.label}
              <span className="text-muted">{r.categoryCounts.find((x) => x.category === c.id)?.n ?? 0}</span>
            </label>
          ))}
        </fieldset>

        {r.sizeCounts.length > 0 && (
          <fieldset>
            <legend className="mb-1 font-semibold">Size on tag</legend>
            <div className="flex flex-wrap gap-2">
              {r.sizeCounts.map((s) => (
                <label key={s.size} className="flex items-center gap-1 rounded border border-line px-2 py-1">
                  <input type="checkbox" name="size" value={s.size} defaultChecked={p.sizes.some((x) => x.toLowerCase() === s.size.toLowerCase())} />
                  {s.size}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold">Measurements (cm)</legend>
          <p className="text-xs text-muted">Chest, waist and hip all the way around. Flat measurements are converted for you.</p>
          {(Object.keys(MEASURE_LABELS) as (keyof typeof MEASURE_LABELS)[]).map((k) => (
            <div key={k} className="grid grid-cols-[60px_1fr_1fr] items-center gap-2">
              <span>{MEASURE_LABELS[k]}</span>
              <input className={field} name={`${k}_min`} inputMode="numeric" placeholder="min" defaultValue={p.measurements[k]?.min ?? ""} aria-label={`${MEASURE_LABELS[k]} minimum`} />
              <input className={field} name={`${k}_max`} inputMode="numeric" placeholder="max" defaultValue={p.measurements[k]?.max ?? ""} aria-label={`${MEASURE_LABELS[k]} maximum`} />
            </div>
          ))}
          <label className="flex items-center gap-2">
            <input type="checkbox" name="unmeasured" value="1" defaultChecked={p.includeUnmeasured} />
            Include items without measurements
          </label>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold">Price (₹)</legend>
          <div className="grid grid-cols-2 gap-2">
            <input className={field} name="price_min" inputMode="numeric" placeholder="min" defaultValue={p.price.min ?? ""} aria-label="Minimum price" />
            <input className={field} name="price_max" inputMode="numeric" placeholder="max" defaultValue={p.price.max ?? ""} aria-label="Maximum price" />
          </div>
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="mb-1 font-semibold">Condition</legend>
          {CONDITIONS.map((c) => (
            <label key={c} className="flex items-center gap-2">
              <input type="checkbox" name="cond" value={c} defaultChecked={p.conditions.includes(c)} />
              {CONDITION_INFO[c].label}
            </label>
          ))}
        </fieldset>

        <label className="block space-y-1">
          <span className="font-semibold">Brand</span>
          <input className={field} name="brand" defaultValue={p.brand} placeholder="e.g. Levi's" />
        </label>

        <button type="submit" className="w-full rounded-full bg-foreground py-2 font-semibold text-background">
          Apply filters
        </button>
      </form>
  );

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-bold">{p.q ? <>Results for “{p.q}”</> : "Browse"}</h1>
        <p className="text-sm text-muted">
          {r.total} {r.total === 1 ? "piece" : "pieces"}
          {r.mode === "close" && (
            <>
              {" "}
              · No exact matches, so these are <span className="font-medium text-foreground">close matches</span>. Check the spelling?
            </>
          )}
        </p>
      </header>

      {r.stores.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Stores:</span>
          {r.stores.map((s) => (
            <Link key={s.handle} href={`/s/${s.handle}`} className="rounded-full border border-line px-3 py-1 hover:border-foreground">
              {s.displayName}
            </Link>
          ))}
        </div>
      )}

      <nav aria-label="Filter by availability" className="flex gap-2 overflow-x-auto pb-1">
        {SEARCH_STOCK.map((s) => (
          <Link
            key={s}
            href={href({ ...p, stock: s, page: 1 })}
            aria-current={s === p.stock ? "page" : undefined}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium ${
              s === p.stock ? "border-foreground bg-foreground text-background" : "border-line hover:border-foreground"
            }`}
          >
            {STOCK_LABELS[s]} <span className={s === p.stock ? "opacity-80" : "text-muted"}>{r.stockCounts[s]}</span>
          </Link>
        ))}
      </nav>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {chips.map((c) => (
            <Link key={c.label} href={c.href} className="rounded-full bg-placeholder px-3 py-1 hover:bg-line" aria-label={`Remove filter ${c.label}`}>
              {c.label} <span aria-hidden="true">×</span>
            </Link>
          ))}
          <Link href={href({ q: p.q, stock: p.stock, sort: p.sort })} className="text-muted underline">
            Clear all
          </Link>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <details className="rounded-lg border border-line bg-surface p-3 md:hidden" open={chips.length > 0}>
          <summary className="cursor-pointer text-sm font-semibold">Filters{chips.length ? ` (${chips.length})` : ""}</summary>
          <div className="mt-3">{filterForm}</div>
        </details>
        <aside aria-label="Filters" className="hidden md:block">
          {filterForm}
        </aside>

        <section aria-label="Results" className="space-y-6">
          {r.hits.length > 0 ? (
            <ProductGrid items={r.hits} showSeller />
          ) : (
            <div className="space-y-3 rounded-lg border border-line bg-surface p-6 text-center text-sm">
              <p className="font-medium">Nothing matches right now.</p>
              {chips.length > 0 ? (
                <p className="text-muted">Try removing a filter: {chips.map((c, i) => (
                  <span key={c.label}>
                    {i > 0 && ", "}
                    <Link href={c.href} className="underline">
                      {c.label}
                    </Link>
                  </span>
                ))}.</p>
              ) : p.stock === "in-stock" && (r.stockCounts["sold-out"] > 0 || r.stockCounts["coming-soon"] > 0) ? (
                <p className="text-muted">
                  Nothing in stock, but there {r.stockCounts["coming-soon"] > 0 ? (
                    <Link href={href({ ...p, stock: "coming-soon", page: 1 })} className="underline">are pieces coming soon</Link>
                  ) : (
                    <Link href={href({ ...p, stock: "sold-out", page: 1 })} className="underline">are sold-out pieces to browse</Link>
                  )}.
                </p>
              ) : (
                <p className="text-muted">Try a shorter search, or <Link href="/search" className="underline">browse everything</Link>.</p>
              )}
            </div>
          )}

          {r.pageCount > 1 && (
            <nav aria-label="Pages" className="flex items-center justify-between text-sm">
              {p.page > 1 ? <Link href={href({ ...p, page: p.page - 1 })} className="underline">← Previous</Link> : <span />}
              <span className="text-muted">
                Page {p.page} of {r.pageCount}
              </span>
              {p.page < r.pageCount ? <Link href={href({ ...p, page: p.page + 1 })} className="underline">Next →</Link> : <span />}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
