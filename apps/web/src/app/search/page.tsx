import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { searchListings } from "@yolt/core";
import { parseSearchParams, SEARCH_SORTS, type SearchParams, type SearchStock } from "@yolt/shared";
import { ProductGrid } from "@/components/product-card";
import { Explore } from "@/components/search/explore";
import { FilterSheetButton, FilterSidebar } from "@/components/search/filters";
import { ResultTabs } from "@/components/search/result-tabs";
import { SortMenu } from "@/components/search/sort-menu";
import { StoreRow } from "@/components/search/store-row";
import { StockPills } from "@/components/stock-pills";
import { ButtonLink } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { HangTag } from "@/components/ui/hang-tag";
import { db } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/session";
import { getFollowedSellerIds, getRelaxedSearches, getSearchStoreRows, getStores, getStoresToDiscover } from "@/lib/server/queries";
import { activeFilters, didYouMean, isExplore, searchHref, SORT_LABELS } from "@/lib/search-filters";
import "@/styles/search.css";

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const { q } = parseSearchParams(await searchParams);
  return { title: q ? `“${q}”` : "Explore", robots: { index: false } };
}

const COUNT_LINE: Record<SearchStock, (n: number) => string> = {
  "in-stock": (n) => `${n} ${n === 1 ? "piece" : "pieces"} · includes reserved`,
  "sold-out": (n) => `${n} sold · for reference`,
  "coming-soon": (n) => `${n} coming soon`,
};

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  await connection();
  const p = parseSearchParams(await searchParams);
  const user = await getCurrentUser();
  const r = await searchListings(db, p);

  if (isExplore(p)) {
    const [stores, followed] = await Promise.all([getStoresToDiscover(6), user ? getFollowedSellerIds(user.userId) : []]);
    return <Explore categoryCounts={r.categoryCounts} sizes={r.sizeCounts} stores={stores} following={new Set(followed)} signedIn={user !== null} />;
  }

  const chips = activeFilters(p);
  const zero = r.hits.length === 0;
  const [filterStores, storeRows, relaxed] = await Promise.all([
    getStores(),
    getSearchStoreRows(p.q ? r.stores.map((s) => s.handle) : null),
    zero && chips.length > 0 ? getRelaxedSearches(chips.map((c) => c.without)) : null,
  ]);
  const options = { params: p, sizes: r.sizeCounts.map((s) => s.size), stores: filterStores.map((s) => ({ handle: s.handle, displayName: s.displayName })), total: r.total };
  const corrected = r.mode === "close" ? didYouMean(p.q, r.hits.map((h) => h.title)) : null;
  const clearAll = searchHref({ q: p.q, stock: p.stock, sort: p.sort });

  const products = (
    <div className="grid gap-6 pt-3 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8 lg:pt-5">
      <FilterSidebar options={options} count={chips.length} />

      <section aria-label="Results" className="flex min-w-0 flex-col gap-3 lg:gap-4">
        <StockPills basePath="/search" active={p.stock} counts={r.stockCounts} hrefFor={(stock) => searchHref({ ...p, stock, page: 1 })} />

        <div className="chip-row">
          <FilterSheetButton options={options} count={chips.length} />
          {chips.map((c) => (
            <FilterChip key={c.label} label={c.label} href={c.href} />
          ))}
        </div>

        {r.mode === "close" && (
          <div role="status" className="flex flex-col gap-0.5 rounded-xl bg-surface-2 px-3.5 py-3">
            {corrected ? (
              <span className="t-small">
                Showing results for <strong>“{corrected}”</strong>
              </span>
            ) : (
              <span className="t-small">
                No exact matches for <strong>“{p.q}”</strong>. Showing the closest ones.
              </span>
            )}
            {corrected && <span className="t-small muted">Nothing matched “{p.q}” exactly.</span>}
          </div>
        )}

        {!zero && (
          <div className="flex items-center justify-between gap-2">
            <p className="t-small muted">{COUNT_LINE[p.stock](r.total)}</p>
            <SortMenu current={p.sort} options={SEARCH_SORTS.map((s) => ({ value: s, label: SORT_LABELS[s], href: searchHref({ ...p, sort: s, page: 1 }) }))} />
          </div>
        )}

        {zero ? <ZeroResults p={p} chips={chips} gains={relaxed?.gains ?? []} close={relaxed?.close ?? []} stockCounts={r.stockCounts} clearAll={clearAll} /> : <ProductGrid items={r.hits} showSeller />}

        {r.pageCount > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-between gap-3 pt-2">
            {p.page > 1 ? (
              <ButtonLink href={searchHref({ ...p, page: p.page - 1 })} variant="secondary" size="sm" className="!h-11">
                Previous
              </ButtonLink>
            ) : (
              <span />
            )}
            <span className="t-small muted">
              Page {p.page} of {r.pageCount}
            </span>
            {p.page < r.pageCount ? (
              <ButtonLink href={searchHref({ ...p, page: p.page + 1 })} variant="secondary" size="sm" className="!h-11">
                Next
              </ButtonLink>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
    </div>
  );

  const stores = (
    <section aria-label="Stores" className="flex flex-col gap-2.5 pt-3.5 lg:pt-5">
      <p className="t-small muted">
        {storeRows.length} {storeRows.length === 1 ? "store" : "stores"}
        {p.q ? ` matching “${p.q}”` : ""}
      </p>
      {storeRows.length > 0 ? (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {storeRows.map((s) => (
            <StoreRow key={s.id} store={s} />
          ))}
        </div>
      ) : (
        <p className="t-body muted py-6">No store matches “{p.q}”. Try the Products tab.</p>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-3 lg:gap-4">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="t-h1 break-words">{p.q ? <>“{p.q}”</> : "Browse"}</h1>
        <p className="t-small muted">
          {r.stockCounts[p.stock]} {p.stock === "in-stock" ? "in stock" : p.stock === "sold-out" ? "sold" : "coming soon"}
          {r.stores.length > 0 && ` · ${r.stores.length} ${r.stores.length === 1 ? "store" : "stores"}`}
        </p>
      </header>
      <ResultTabs productsLabel={`Products · ${r.total}`} storesLabel={`Stores · ${storeRows.length}`} products={products} stores={stores} />
    </div>
  );
}

/** Zero results (board SearchZero): which filters to drop and what each one gives back, then close matches. */
function ZeroResults({
  p,
  chips,
  gains,
  close,
  stockCounts,
  clearAll,
}: {
  p: SearchParams;
  chips: ReturnType<typeof activeFilters>;
  gains: number[];
  close: React.ComponentProps<typeof ProductGrid>["items"];
  stockCounts: Record<SearchStock, number>;
  clearAll: string;
}) {
  if (chips.length === 0) {
    const other = p.stock === "in-stock" ? (stockCounts["coming-soon"] > 0 ? "coming-soon" : stockCounts["sold-out"] > 0 ? "sold-out" : null) : null;
    return (
      <div className="card flex flex-col gap-3 p-5">
        <span aria-hidden="true" className="self-start">
          <HangTag size="lg" ink className="-rotate-6">
            0
          </HangTag>
        </span>
        <p className="t-h3">{p.q ? <>No pieces match “{p.q}”.</> : "Nothing here right now."}</p>
        <p className="t-small muted">
          {other ? (
            <>
              Nothing in stock, but there {other === "coming-soon" ? "are pieces coming soon" : "are sold-out pieces to browse"}.{" "}
              <Link href={searchHref({ ...p, stock: other, page: 1 })} className="font-bold">
                See them
              </Link>
            </>
          ) : (
            "Try a shorter search or another spelling."
          )}
        </p>
        <ButtonLink href={searchHref({ sort: "newest" })} variant="secondary" size="sm" className="self-start !h-11">
          Browse the newest pieces
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="card flex flex-col gap-3 p-5">
        <span aria-hidden="true" className="self-start">
          <HangTag size="lg" ink className="-rotate-6">
            0
          </HangTag>
        </span>
        <p className="t-h3">No pieces match all your filters.</p>
        <p className="t-small muted">Remove one to see more. Here&apos;s what each gives you back:</p>
        <ul className="flex flex-col gap-1.5">
          {chips.map((c, i) => (
            <li key={c.label} className="flex flex-wrap items-center justify-between gap-2">
              <FilterChip label={c.label} href={c.href} />
              <span className="t-small muted">{gains[i] ? `+ ${gains[i]} ${gains[i] === 1 ? "piece" : "pieces"}` : "no change"}</span>
            </li>
          ))}
        </ul>
        <Link href={clearAll} scroll={false} className="btn btn-sm btn-ghost !h-11 self-start !px-0">
          Clear all filters
        </Link>
      </div>
      {close.length > 0 && (
        <section aria-labelledby="close-h" className="flex flex-col gap-2.5">
          <h2 id="close-h" className="t-h2">
            Close matches
          </h2>
          <span className="t-caption muted">Each one misses just one of your filters</span>
          <ProductGrid items={close} showSeller />
        </section>
      )}
    </div>
  );
}
