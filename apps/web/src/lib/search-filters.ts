import { CONDITION_INFO, getCategory, searchParamsToQuery, tokenizeQuery, type SearchParams } from "@yolt/shared";

/** Pure helpers for the search page: the filter chips, the URLs that remove them, and typo notes. */

export const SORT_LABELS = { relevance: "Relevance", newest: "Newest", price_asc: "Price low–high", price_desc: "Price high–low" } as const;
export const MEASURE_LABELS = { chest: "Chest", waist: "Waist", hip: "Hip", length: "Length" } as const;

export const searchHref = (p: Partial<SearchParams>) => `/search${searchParamsToQuery(p)}`;

const range = (r?: { min?: number; max?: number }) =>
  r?.min !== undefined && r?.max !== undefined ? `${r.min}–${r.max}` : r?.min !== undefined ? `${r.min}+` : `up to ${r?.max}`;

export type FilterChipData = { label: string; href: string; /** The same search with this one filter taken off. */ without: SearchParams };

/** One chip per active filter. Each one links to the same search without just that filter. */
export function activeFilters(p: SearchParams): FilterChipData[] {
  const chips: FilterChipData[] = [];
  const add = (label: string, without: Partial<SearchParams>) => {
    const next = { ...p, ...without, page: 1 };
    chips.push({ label, href: searchHref(next), without: next });
  };
  for (const c of p.categories) add(getCategory(c)?.label ?? c, { categories: p.categories.filter((x) => x !== c) });
  for (const s of p.sizes) add(`Size ${s}`, { sizes: p.sizes.filter((x) => x !== s) });
  for (const c of p.conditions) add(CONDITION_INFO[c].label, { conditions: p.conditions.filter((x) => x !== c) });
  if (p.price.min !== undefined || p.price.max !== undefined) add(`₹${range(p.price)}`, { price: {} });
  for (const [k, r] of Object.entries(p.measurements) as [keyof typeof MEASURE_LABELS, { min?: number; max?: number }][]) {
    const rest = { ...p.measurements };
    delete rest[k];
    add(`${MEASURE_LABELS[k]} ${range(r)} cm`, { measurements: rest });
  }
  if (p.brand) add(`Brand: ${p.brand}`, { brand: "" });
  if (p.store) add(`Store: ${p.store}`, { store: "" });
  return chips;
}

/** True when nothing narrows the search: this is the Explore state. */
export function isExplore(p: SearchParams) {
  return !p.q && p.stock === "in-stock" && p.sort === "relevance" && p.page === 1 && activeFilters(p).length === 0 && !p.includeUnmeasured;
}

function distance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length]!;
}

/**
 * The spelling the close matches seem to be for: each query word that no title uses is swapped for
 * the nearest title word (at most two edits away). Null when nothing is a clear correction.
 */
export function didYouMean(q: string, titles: string[]): string | null {
  const words = [...new Set(titles.flatMap((t) => t.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/)).filter((w) => w.length > 2))];
  let changed = false;
  const fixed = tokenizeQuery(q).map(({ term }) => {
    if (words.includes(term) || term.length < 4) return term;
    let best: string | null = null;
    let bestD = 3;
    for (const w of words) {
      const d = distance(term, w);
      if (d < bestD) [best, bestD] = [w, d];
    }
    if (best && bestD <= 2) {
      changed = true;
      return best;
    }
    return term;
  });
  return changed ? fixed.join(" ") : null;
}
