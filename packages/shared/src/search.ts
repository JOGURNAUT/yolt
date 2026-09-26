import { CATEGORIES, CONDITIONS, type Condition } from "./catalog";

/**
 * Search parameters shared by the web page, the API and (later) the app, so a URL like
 * /search?q=levis&cat=jeans&waist=76-86&sort=price_asc means the same thing everywhere
 * and can be shared or bookmarked.
 */

export const SEARCH_SORTS = ["relevance", "newest", "price_asc", "price_desc"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];
export const SEARCH_STOCK = ["in-stock", "sold-out", "coming-soon"] as const;
export type SearchStock = (typeof SEARCH_STOCK)[number];

/** Filterable body measurements. Widths are compared as the garment's full circumference ("around"). */
export const MEASUREMENT_FILTERS = ["chest", "waist", "hip", "length"] as const;
export type MeasurementFilter = (typeof MEASUREMENT_FILTERS)[number];
export const WIDTH_FILTERS: MeasurementFilter[] = ["chest", "waist", "hip"];

export type Range = { min?: number; max?: number };

export type SearchParams = {
  q: string;
  categories: string[];
  sizes: string[];
  conditions: Condition[];
  price: Range; // rupees
  measurements: Partial<Record<MeasurementFilter, Range>>; // cm
  /** Include items that don't have the filtered measurement (off by default when filtering by one). */
  includeUnmeasured: boolean;
  brand: string;
  store: string;
  stock: SearchStock;
  sort: SearchSort;
  page: number;
};

export const PAGE_SIZE = 24;
const MAX_QUERY = 100;

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function all(raw: RawParams, key: string): string[] {
  if (raw instanceof URLSearchParams) return raw.getAll(key);
  const v = raw[key];
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}
const one = (raw: RawParams, key: string) => all(raw, key)[0] ?? "";

/** "76-86", "76-", "-86" → range; anything else → empty. */
function parseRange(value: string, max: number): Range {
  const m = /^(\d{1,6})?-(\d{1,6})?$/.exec(value.trim());
  if (!m) return {};
  const r: Range = {};
  if (m[1] !== undefined) r.min = Math.min(Number(m[1]), max);
  if (m[2] !== undefined) r.max = Math.min(Number(m[2]), max);
  if (r.min !== undefined && r.max !== undefined && r.min > r.max) [r.min, r.max] = [r.max, r.min];
  return r;
}
const rangeToString = (r: Range | undefined) => (r && (r.min !== undefined || r.max !== undefined) ? `${r.min ?? ""}-${r.max ?? ""}` : "");

const splitList = (values: string[]) => values.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

/**
 * A range from "key=min-max", or from "key_min"/"key_max" as a plain HTML form submits them.
 * Blank or non-numeric parts are ignored.
 */
function readRange(raw: RawParams, key: string, max: number): Range {
  const combined = one(raw, key);
  if (combined) return parseRange(combined, max);
  const lo = one(raw, `${key}_min`).trim();
  const hi = one(raw, `${key}_max`).trim();
  return parseRange(`${/^\d{1,6}$/.test(lo) ? lo : ""}-${/^\d{1,6}$/.test(hi) ? hi : ""}`, max);
}

/** Parses untrusted query parameters. Unknown or malformed values are dropped, never errors. */
export function parseSearchParams(raw: RawParams): SearchParams {
  const measurements: SearchParams["measurements"] = {};
  for (const key of MEASUREMENT_FILTERS) {
    const r = readRange(raw, key, 400);
    if (r.min !== undefined || r.max !== undefined) measurements[key] = r;
  }
  const sort = one(raw, "sort") as SearchSort;
  const stock = one(raw, "status") as SearchStock;
  const page = Number.parseInt(one(raw, "page"), 10);
  return {
    q: one(raw, "q").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY),
    categories: [...new Set(splitList(all(raw, "cat")).filter((c) => CATEGORY_IDS.has(c)))],
    sizes: [...new Set(splitList(all(raw, "size")).map((s) => s.slice(0, 30)))].slice(0, 20),
    conditions: [...new Set(splitList(all(raw, "cond")).filter((c): c is Condition => (CONDITIONS as readonly string[]).includes(c)))],
    price: readRange(raw, "price", 500_000),
    measurements,
    includeUnmeasured: one(raw, "unmeasured") === "1",
    brand: one(raw, "brand").trim().slice(0, 60),
    store: one(raw, "store").trim().toLowerCase().slice(0, 40),
    stock: SEARCH_STOCK.includes(stock) ? stock : "in-stock",
    sort: SEARCH_SORTS.includes(sort) ? sort : "relevance",
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 100) : 1,
  };
}

/** Builds a query string, omitting defaults so URLs stay short and canonical. */
export function searchParamsToQuery(p: Partial<SearchParams>): string {
  const u = new URLSearchParams();
  if (p.q) u.set("q", p.q);
  if (p.categories?.length) u.set("cat", p.categories.join(","));
  if (p.sizes?.length) u.set("size", p.sizes.join(","));
  if (p.conditions?.length) u.set("cond", p.conditions.join(","));
  const price = rangeToString(p.price);
  if (price) u.set("price", price);
  for (const key of MEASUREMENT_FILTERS) {
    const r = rangeToString(p.measurements?.[key]);
    if (r) u.set(key, r);
  }
  if (p.includeUnmeasured) u.set("unmeasured", "1");
  if (p.brand) u.set("brand", p.brand);
  if (p.store) u.set("store", p.store);
  if (p.stock && p.stock !== "in-stock") u.set("status", p.stock);
  if (p.sort && p.sort !== "relevance") u.set("sort", p.sort);
  if (p.page && p.page > 1) u.set("page", String(p.page));
  const s = u.toString();
  return s ? `?${s}` : "";
}

// ---------------------------------------------------------------------------
// Query understanding
// ---------------------------------------------------------------------------

/** Words buyers use for a category. A query word matching one also matches that category. */
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  tops: ["tee", "tees", "tshirt", "tshirts", "t-shirt", "top", "tops", "tank", "crop", "polo"],
  shirts: ["shirt", "shirts", "flannel", "overshirt"],
  knitwear: ["sweater", "sweaters", "jumper", "cardigan", "knit", "knitwear", "sweatshirt", "hoodie"],
  jackets: ["jacket", "jackets", "coat", "bomber", "windbreaker", "blazer", "varsity", "puffer", "trucker"],
  dresses: ["dress", "dresses", "gown"],
  kurtas: ["kurta", "kurtas", "kurti", "ethnic"],
  jeans: ["jeans", "denim"],
  trousers: ["pants", "trousers", "chinos", "cargo", "cargos", "trackpants", "joggers"],
  shorts: ["shorts"],
  skirts: ["skirt", "skirts"],
  sneakers: ["sneaker", "sneakers", "shoes", "kicks", "trainers"],
  footwear: ["shoes", "sandals", "boots", "heels"],
  bags: ["bag", "bags", "purse", "tote", "backpack", "sling"],
  accessories: ["cap", "hat", "belt", "scarf", "jewellery", "jewelry", "sunglasses"],
};
const SYNONYM_INDEX = new Map<string, string[]>();
for (const [cat, words] of Object.entries(CATEGORY_SYNONYMS)) {
  for (const w of words) {
    const key = w.replace(/[^a-z0-9]/g, "");
    SYNONYM_INDEX.set(key, [...new Set([...(SYNONYM_INDEX.get(key) ?? []), cat])]);
  }
}

export type QueryTerm = { term: string; categories: string[] };

/**
 * Splits a query into search terms. Apostrophes are removed ("levi's" → "levis") to match how
 * the search index normalises text; each term notes any categories it also stands for.
 */
export function tokenizeQuery(q: string): QueryTerm[] {
  const terms = q
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\bt[\s-]?shirts?\b/g, "tshirt") // "t-shirt", "t shirt" mean T-shirts, not shirts
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)
    .slice(0, 8);
  return [...new Set(terms)].map((term) => ({ term, categories: SYNONYM_INDEX.get(term) ?? [] }));
}
