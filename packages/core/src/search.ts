import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import {
  PAGE_SIZE,
  tokenizeQuery,
  WIDTH_FILTERS,
  type MeasurementFilter,
  type SearchParams,
  type SearchStock,
} from "@yolt/shared";
import { drops, listingPhotos, listings, sellers, type Db, type Listing } from "@yolt/db";

/**
 * Catalog search on Postgres (docs/decisions.md: Typesense later, once the catalog is large).
 *
 * Matching: every query word must match, by full-text prefix ("jack" → jacket) or by a
 * category synonym ("tee" → T-shirts). If nothing matches, fall back to close matches by
 * trigram word similarity (typos like "levsi" or "jaket"), and say so.
 * Measurements: widths are compared as full circumference, so a filter of chest 96–104 cm
 * matches a listing measured 50 cm flat. Unknown measurements are excluded unless the buyer
 * asks to include them — never guessed.
 */

// These expressions are indexed in migrations/0006_search_indexes.sql and must match it exactly.
const LISTING_SEARCH_DOC = sql.raw(
  `translate(lower(coalesce("listings"."title", '') || ' ' || coalesce("listings"."brand_declared", '') || ' ' || coalesce("listings"."category", '') || ' ' || coalesce("listings"."tag_size", '') || ' ' || coalesce("listings"."description", '')), '''’', '')`,
);
const LISTING_TRGM_DOC = sql.raw(`translate(lower(coalesce("listings"."title", '') || ' ' || coalesce("listings"."brand_declared", '')), '''’', '')`);
const SELLER_TRGM_DOC = sql.raw(`lower("sellers"."display_name" || ' ' || "sellers"."handle")`);

/** Close-match threshold, from measured scores: typos ≈ 0.44–0.5, unrelated words ≈ 0.17. */
const CLOSE_MATCH_THRESHOLD = 0.4;

const STOCK_STATUSES: Record<SearchStock, Listing["status"][]> = {
  "in-stock": ["AVAILABLE", "RESERVED", "PAYMENT_PENDING"],
  "sold-out": ["SOLD", "SOLD_ELSEWHERE"],
  "coming-soon": ["SCHEDULED"],
};

const MEASUREMENT_KEYS: Record<MeasurementFilter, string> = { chest: "chestCm", waist: "waistCm", hip: "hipCm", length: "lengthCm" };

/** A listing's measurement in cm; widths as full circumference. NULL when unknown. */
function measurementSql(filter: MeasurementFilter): SQL {
  const key = MEASUREMENT_KEYS[filter];
  const value = sql`(${listings.measurements}->>${key})::numeric`;
  if (!WIDTH_FILTERS.includes(filter)) return value;
  return sql`(CASE ${listings.measurements}->>'basis' WHEN 'AROUND' THEN ${value} WHEN 'FLAT' THEN ${value} * 2 END)`;
}

type Mode = "browse" | "exact" | "close";

function textConditions(params: SearchParams, mode: Mode): SQL | undefined {
  const terms = tokenizeQuery(params.q);
  if (mode === "browse" || terms.length === 0) return undefined;
  const perTerm = terms.map(({ term, categories }) => {
    const text =
      mode === "exact"
        ? sql`to_tsvector('simple', ${LISTING_SEARCH_DOC}) @@ to_tsquery('simple', ${`${term}:*`})`
        : sql`word_similarity(${term}, ${LISTING_TRGM_DOC}) >= ${CLOSE_MATCH_THRESHOLD}`;
    return categories.length ? or(text, inArray(listings.category, categories))! : text;
  });
  return and(...perTerm);
}

/** Everything except the text match and the stock pill (so pill counts can reuse it). */
function filterConditions(params: SearchParams, skip: { categories?: boolean; sizes?: boolean } = {}): SQL[] {
  const c: SQL[] = [eq(sellers.status, "APPROVED")];
  if (params.categories.length && !skip.categories) c.push(inArray(listings.category, params.categories));
  if (params.sizes.length && !skip.sizes) {
    c.push(inArray(sql`lower(${listings.tagSize})`, params.sizes.map((s) => s.toLowerCase())));
  }
  if (params.conditions.length) c.push(inArray(listings.condition, params.conditions));
  if (params.price.min !== undefined) c.push(sql`${listings.pricePaise} >= ${params.price.min * 100}`);
  if (params.price.max !== undefined) c.push(sql`${listings.pricePaise} <= ${params.price.max * 100}`);
  if (params.brand) c.push(ilike(listings.brandDeclared, `%${params.brand.replace(/[%_\\]/g, "\\$&")}%`));
  if (params.store) c.push(eq(sellers.handle, params.store));
  for (const [key, range] of Object.entries(params.measurements) as [MeasurementFilter, { min?: number; max?: number }][]) {
    const m = measurementSql(key);
    const within = and(
      range.min !== undefined ? sql`${m} >= ${range.min}` : undefined,
      range.max !== undefined ? sql`${m} <= ${range.max}` : undefined,
    )!;
    c.push(params.includeUnmeasured ? or(within, sql`${m} IS NULL`)! : within);
  }
  return c;
}

function orderBy(params: SearchParams, mode: Mode): SQL[] {
  if (params.sort === "price_asc") return [asc(listings.pricePaise), desc(listings.publishedAt)];
  if (params.sort === "price_desc") return [desc(listings.pricePaise), desc(listings.publishedAt)];
  const recency =
    params.stock === "sold-out" ? desc(listings.soldAt) : params.stock === "coming-soon" ? asc(drops.startsAt) : desc(listings.publishedAt);
  if (params.sort === "newest" || mode === "browse") return [recency];
  // Relevance: full-text rank plus title/brand similarity to the whole query, newest first on ties.
  const q = tokenizeQuery(params.q)
    .map((t) => t.term)
    .join(" ");
  const tsq = q.split(" ").map((t) => `${t}:*`).join(" | ");
  return [
    desc(sql`ts_rank(to_tsvector('simple', ${LISTING_SEARCH_DOC}), to_tsquery('simple', ${tsq})) + word_similarity(${q}, ${LISTING_TRGM_DOC})`),
    recency,
  ];
}

const hitColumns = {
  id: listings.id,
  slug: listings.slug,
  title: listings.title,
  tagSize: listings.tagSize,
  condition: listings.condition,
  pricePaise: listings.pricePaise,
  status: listings.status,
  category: listings.category,
  sellerName: sellers.displayName,
  sellerHandle: sellers.handle,
  dropStartsAt: drops.startsAt,
  // Correlated subquery with explicit table names (Drizzle leaves columns unqualified without a join).
  coverUrl: sql<string | null>`(
    SELECT lp.url FROM ${listingPhotos} lp WHERE lp.listing_id = ${listings}.id ORDER BY lp.position LIMIT 1)`,
  total: sql<number>`count(*) over ()`.mapWith(Number),
};

export type SearchHit = {
  id: string;
  slug: string;
  title: string;
  tagSize: string | null;
  condition: NonNullable<Listing["condition"]>;
  pricePaise: number;
  status: Listing["status"];
  category: string;
  sellerName: string;
  sellerHandle: string;
  dropStartsAt: Date | null;
  coverUrl: string | null;
};

async function runQuery(db: Db, params: SearchParams, mode: Mode) {
  const rows = await db
    .select(hitColumns)
    .from(listings)
    .innerJoin(sellers, eq(sellers.id, listings.sellerId))
    .leftJoin(drops, eq(drops.id, listings.dropId))
    .where(and(inArray(listings.status, STOCK_STATUSES[params.stock]), textConditions(params, mode), ...filterConditions(params)))
    .orderBy(...orderBy(params, mode))
    .limit(PAGE_SIZE)
    .offset((params.page - 1) * PAGE_SIZE);
  const total = rows[0]?.total ?? 0;
  const hits: SearchHit[] = rows.map(({ total: _total, ...r }) => {
    // Only non-draft statuses are searched, and the database guarantees those are complete.
    if (r.title === null || r.category === null || r.condition === null || r.pricePaise === null) {
      throw new Error(`incomplete listing ${r.id} in search results`);
    }
    return { ...r, title: r.title, category: r.category, condition: r.condition, pricePaise: r.pricePaise };
  });
  return { hits, total };
}

export type SearchResult = {
  mode: Mode;
  hits: SearchHit[];
  total: number;
  page: number;
  pageCount: number;
  stockCounts: Record<SearchStock, number>;
  categoryCounts: { category: string; n: number }[];
  sizeCounts: { size: string; n: number }[];
  stores: { handle: string; displayName: string }[];
};

export async function searchListings(db: Db, params: SearchParams): Promise<SearchResult> {
  const hasQuery = tokenizeQuery(params.q).length > 0;
  let mode: Mode = hasQuery ? "exact" : "browse";
  let result = await runQuery(db, params, mode);
  // Typo recovery: only when an exact search found nothing at all.
  if (mode === "exact" && result.total === 0 && params.page === 1) {
    const close = await runQuery(db, params, "close");
    if (close.total > 0) {
      result = close;
      mode = "close";
    }
  }
  const { hits, total } = result;

  const text = textConditions(params, mode);
  const base = (skip?: { categories?: boolean; sizes?: boolean }) =>
    and(text, ...filterConditions(params, skip));

  const [stockRows, categoryRows, sizeRows, stores] = await Promise.all([
    // Pill counts: same filters, each stock state.
    db
      .select({ status: listings.status, n: sql<number>`count(*)::int` })
      .from(listings)
      .innerJoin(sellers, eq(sellers.id, listings.sellerId))
      .where(and(inArray(listings.status, Object.values(STOCK_STATUSES).flat()), base()))
      .groupBy(listings.status),
    // Category counts ignore the category filter itself, so buyers can switch.
    db
      .select({ category: listings.category, n: sql<number>`count(*)::int` })
      .from(listings)
      .innerJoin(sellers, eq(sellers.id, listings.sellerId))
      .where(and(inArray(listings.status, STOCK_STATUSES[params.stock]), base({ categories: true })))
      .groupBy(listings.category)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({ size: listings.tagSize, n: sql<number>`count(*)::int` })
      .from(listings)
      .innerJoin(sellers, eq(sellers.id, listings.sellerId))
      .where(and(inArray(listings.status, STOCK_STATUSES[params.stock]), base({ sizes: true }), sql`${listings.tagSize} IS NOT NULL`))
      .groupBy(listings.tagSize)
      .orderBy(desc(sql`count(*)`))
      .limit(24),
    hasQuery && params.page === 1
      ? db
          .select({ handle: sellers.handle, displayName: sellers.displayName })
          .from(sellers)
          .where(and(eq(sellers.status, "APPROVED"), sql`word_similarity(${params.q.toLowerCase()}, ${SELLER_TRGM_DOC}) >= 0.5`))
          .orderBy(desc(sql`word_similarity(${params.q.toLowerCase()}, ${SELLER_TRGM_DOC})`))
          .limit(5)
      : Promise.resolve([]),
  ]);

  const byStatus = new Map(stockRows.map((r) => [r.status, r.n]));
  const stockCounts = Object.fromEntries(
    Object.entries(STOCK_STATUSES).map(([k, statuses]) => [k, statuses.reduce((t, s) => t + (byStatus.get(s) ?? 0), 0)]),
  ) as Record<SearchStock, number>;

  return {
    mode,
    hits,
    total,
    page: params.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    stockCounts,
    categoryCounts: categoryRows.filter((r): r is { category: string; n: number } => r.category !== null),
    sizeCounts: sizeRows.filter((r): r is { size: string; n: number } => r.size !== null),
    stores,
  };
}
