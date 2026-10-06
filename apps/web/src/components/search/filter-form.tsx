"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { CATEGORIES, CONDITION_INFO, CONDITIONS, searchParamsToQuery, type Condition, type SearchParams } from "@yolt/shared";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";

export type FilterOptions = {
  params: SearchParams;
  /** Tag sizes on offer, most common first. Sizes already chosen are always shown. */
  sizes: string[];
  stores: { handle: string; displayName: string }[];
  /** How many pieces the current filters show. */
  total: number;
};

type Range = { min: string; max: string };
type State = {
  categories: string[];
  sizes: string[];
  conditions: Condition[];
  price: Range;
  measures: Record<"chest" | "waist" | "hip" | "length", Range>;
  unmeasured: boolean;
  brand: string;
  store: string;
};

const MEASURES = [
  ["chest", "Chest"],
  ["waist", "Waist"],
  ["length", "Length"],
  ["hip", "Hip"],
] as const;

const asRange = (r?: { min?: number; max?: number }): Range => ({ min: r?.min?.toString() ?? "", max: r?.max?.toString() ?? "" });
const num = (v: string) => (/^\d{1,6}$/.test(v.trim()) ? Number(v.trim()) : undefined);
const toRange = (r: Range) => ({ min: num(r.min), max: num(r.max) });

function initial(p: SearchParams): State {
  return {
    categories: p.categories,
    sizes: p.sizes,
    conditions: p.conditions,
    price: asRange(p.price),
    measures: { chest: asRange(p.measurements.chest), waist: asRange(p.measurements.waist), hip: asRange(p.measurements.hip), length: asRange(p.measurements.length) },
    unmeasured: p.includeUnmeasured,
    brand: p.brand,
    store: p.store,
  };
}

const cleared = (p: SearchParams): State => ({ ...initial({ ...p, categories: [], sizes: [], conditions: [], price: {}, measurements: {}, includeUnmeasured: false, brand: "", store: "" }) });

function toParams(base: SearchParams, s: State): SearchParams {
  const measurements: SearchParams["measurements"] = {};
  for (const [k] of MEASURES) {
    const r = toRange(s.measures[k]);
    if (r.min !== undefined || r.max !== undefined) measurements[k] = r;
  }
  return {
    ...base,
    categories: s.categories,
    sizes: s.sizes,
    conditions: s.conditions,
    price: toRange(s.price),
    measurements,
    includeUnmeasured: s.unmeasured,
    brand: s.brand.trim(),
    store: s.store,
    page: 1,
  };
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/**
 * FilterSheet content (board FilterSheet) and the desktop sidebar (board WebSearch): the same form.
 * It is a plain GET form first, so filtering works without JavaScript; with it, the "Show N pieces"
 * count follows the choices and the URL is built in the canonical short format.
 */
export function FilterForm({
  options,
  variant,
  onDone,
  headingId,
}: {
  options: FilterOptions;
  variant: "sheet" | "sidebar";
  onDone?: () => void;
  headingId?: string;
}) {
  const router = useRouter();
  const uid = useId();
  const { params } = options;
  const [s, setS] = useState(() => initial(params));
  const [total, setTotal] = useState(options.total);
  const [showAllCats, setShowAllCats] = useState(false);
  const first = useRef(true);
  const sheet = variant === "sheet";

  const query = searchParamsToQuery(toParams(params, s));
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/search/count${query}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { total: number } | null) => b && setTotal(b.total))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [query]);

  const set = (patch: Partial<State>) => setS((cur) => ({ ...cur, ...patch }));
  const setMeasure = (k: keyof State["measures"], part: Partial<Range>) => setS((cur) => ({ ...cur, measures: { ...cur.measures, [k]: { ...cur.measures[k], ...part } } }));
  const dirty = query !== searchParamsToQuery(toParams(params, initial(params)));
  const anySelected = query !== searchParamsToQuery(toParams(params, cleared(params)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/search${query}`, { scroll: false });
    onDone?.();
  }

  const sizeOptions = [...new Set([...s.sizes, ...options.sizes])];
  const cats = !sheet && !showAllCats ? CATEGORIES.filter((c, i) => i < 8 || s.categories.includes(c.id)) : CATEGORIES;

  const categoryField = sheet ? (
    <div className="flex flex-wrap gap-2">
      {CATEGORIES.map((c) => (
        <label key={c.id} className={cx("pill pill-opt", s.categories.includes(c.id) && "is-active")}>
          <input type="checkbox" name="cat" value={c.id} checked={s.categories.includes(c.id)} onChange={() => set({ categories: toggle(s.categories, c.id) })} />
          {c.label}
        </label>
      ))}
    </div>
  ) : (
    <>
      <div className="flex flex-col">
        {cats.map((c) => (
          <label key={c.id} className="opt">
            <input type="checkbox" className="cbx" name="cat" value={c.id} checked={s.categories.includes(c.id)} onChange={() => set({ categories: toggle(s.categories, c.id) })} />
            <span className="t-small">{c.label}</span>
          </label>
        ))}
      </div>
      {CATEGORIES.length > cats.length && (
        <button type="button" onClick={() => setShowAllCats(true)} className="btn btn-sm btn-ghost self-start !px-0">
          Show all {CATEGORIES.length}
        </button>
      )}
    </>
  );

  return (
    <form action="/search" method="get" onSubmit={submit} className={cx("flex min-h-0 flex-1 flex-col", sheet ? "" : "gap-0")}>
      {params.q && <input type="hidden" name="q" value={params.q} />}
      {params.stock !== "in-stock" && <input type="hidden" name="status" value={params.stock} />}
      {params.sort !== "relevance" && <input type="hidden" name="sort" value={params.sort} />}

      <div className={sheet ? "fsheet-body" : "flex flex-col gap-6"} aria-labelledby={headingId}>
        <fieldset className="fs-fieldset">
          <legend>Category</legend>
          {categoryField}
        </fieldset>

        {sizeOptions.length > 0 && (
          <fieldset className="fs-fieldset">
            <legend>Tag size</legend>
            <div className={sheet ? "flex flex-wrap gap-2" : "grid grid-cols-4 gap-1.5"}>
              {sizeOptions.map((z) => (
                <label key={z} className={cx("pill pill-opt", s.sizes.some((x) => x.toLowerCase() === z.toLowerCase()) && "is-active")}>
                  <input type="checkbox" name="size" value={z} checked={s.sizes.some((x) => x.toLowerCase() === z.toLowerCase())} onChange={() => set({ sizes: toggle(s.sizes, z) })} />
                  {z}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="fs-fieldset">
          <legend>Measurements</legend>
          <p className="t-small muted">In cm. We compare flat and all-round measurements for you.</p>
          {MEASURES.filter(([k]) => k !== "hip" || s.measures.hip.min || s.measures.hip.max).map(([k, label]) => (
            <div key={k} className="fs-range">
              <span className="t-small font-bold">{label}</span>
              <input className="input" name={`${k}_min`} inputMode="numeric" placeholder="Min" aria-label={`${label} minimum, cm`} value={s.measures[k].min} onChange={(e) => setMeasure(k, { min: e.target.value })} />
              <span aria-hidden="true" className="muted">–</span>
              <input className="input" name={`${k}_max`} inputMode="numeric" placeholder="Max" aria-label={`${label} maximum, cm`} value={s.measures[k].max} onChange={(e) => setMeasure(k, { max: e.target.value })} />
            </div>
          ))}
          <label className="opt t-small">
            <input type="checkbox" className="cbx" name="unmeasured" value="1" checked={s.unmeasured} onChange={(e) => set({ unmeasured: e.target.checked })} />
            Include items without measurements
          </label>
        </fieldset>

        <fieldset className="fs-fieldset">
          <legend>Price</legend>
          <div className="grid grid-cols-[minmax(0,1fr)_14px_minmax(0,1fr)] items-center gap-2">
            <input className="input !h-11 !text-base" name="price_min" inputMode="numeric" placeholder="₹ Min" aria-label="Minimum price, rupees" value={s.price.min} onChange={(e) => set({ price: { ...s.price, min: e.target.value } })} />
            <span aria-hidden="true" className="muted">–</span>
            <input className="input !h-11 !text-base" name="price_max" inputMode="numeric" placeholder="₹ Max" aria-label="Maximum price, rupees" value={s.price.max} onChange={(e) => set({ price: { ...s.price, max: e.target.value } })} />
          </div>
        </fieldset>

        <fieldset className="fs-fieldset">
          <legend>Condition</legend>
          {CONDITIONS.map((c) => (
            <label key={c} className="opt">
              <input type="checkbox" className="cbx" name="cond" value={c} checked={s.conditions.includes(c)} onChange={() => set({ conditions: toggle(s.conditions, c) })} />
              <span className="flex flex-col">
                <span className={sheet ? "t-body font-semibold" : "t-small"}>{CONDITION_INFO[c].label}</span>
                {sheet && <span className="t-caption muted !font-medium">{CONDITION_INFO[c].meaning}</span>}
              </span>
            </label>
          ))}
        </fieldset>

        <div className="fs-fieldset">
          <label htmlFor={`${uid}-brand`} className="t-h2 !text-[18px] !leading-[22px]">
            Brand
          </label>
          <input id={`${uid}-brand`} className="input !h-11 !text-base" name="brand" placeholder="Search brands, e.g. Levi's" value={s.brand} onChange={(e) => set({ brand: e.target.value })} />
          <span className="t-caption muted !font-medium">Brands are declared by sellers, not authenticated by YOLT.</span>
        </div>

        {options.stores.length > 0 && (
          <fieldset className="fs-fieldset">
            <legend>Store</legend>
            <label className="opt">
              <input type="radio" className="rdo" name="store" value="" checked={s.store === ""} onChange={() => set({ store: "" })} />
              <span className="t-body">Any store</span>
            </label>
            {options.stores.map((st) => (
              <label key={st.handle} className="opt">
                <input type="radio" className="rdo" name="store" value={st.handle} checked={s.store === st.handle} onChange={() => set({ store: st.handle })} />
                <span className="t-body">{st.displayName}</span>
              </label>
            ))}
          </fieldset>
        )}
      </div>

      <div className={sheet ? "fsheet-foot" : "side-foot"}>
        <Button type="button" variant="ghost" onClick={() => setS(cleared(params))} disabled={!anySelected} className="!px-1.5">
          Clear all
        </Button>
        <Button type="submit" className="flex-1" disabled={!dirty && !sheet}>
          Show {total} {total === 1 ? "piece" : "pieces"}
        </Button>
      </div>
    </form>
  );
}
