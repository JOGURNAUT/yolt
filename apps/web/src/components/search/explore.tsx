import Link from "next/link";
import { CATEGORIES, BUYER_STYLES, searchParamsToQuery } from "@yolt/shared";
import { FollowChip } from "@/components/landing/drop-clock";
import { SILHOUETTE } from "@/components/landing/silhouettes";
import type { StoreCardData } from "@/lib/server/queries";
import "@/styles/search.css";
import { initials } from "./store-row";

const ART = {
  ...SILHOUETTE,
  shirt: SILHOUETTE.polo,
  knit: "M36 16 Q50 24 64 16 L82 28 L74 40 L66 34 L66 88 L34 88 L34 34 L26 40 L18 28 Z M34 50 L66 50 M34 62 L66 62 M34 74 L66 74",
  dress: "M42 10 L58 10 L57 30 L74 90 L26 90 L43 30 Z M43 30 L57 30",
  shorts: "M30 20 L70 20 L74 64 L54 64 L50 40 L46 64 L26 64 Z M30 28 L70 28",
  skirt: "M34 18 L66 18 L78 80 L22 80 Z M34 26 L66 26",
  boot: "M34 14 L54 14 L56 58 L84 66 L86 80 L30 80 Z",
  acc: "M20 50 a30 30 0 1 0 60 0 a30 30 0 1 0 -60 0 M30 50 a20 20 0 1 0 40 0",
} as const;

const CATEGORY_ART: Record<string, keyof typeof ART> = {
  tops: "tee", shirts: "shirt", knitwear: "knit", jackets: "jacket", dresses: "dress", kurtas: "kurta", jeans: "pants",
  trousers: "pants", shorts: "shorts", skirts: "skirt", sneakers: "shoe", footwear: "boot", bags: "bag", accessories: "acc",
};
const TINTS = ["#E4E2DC", "#E1E5E8", "#ECE6D8", "#E6E0D6", "#E7E0CF", "#E8E1D3", "#DFE3E6"];
const STYLE_ART: Record<string, { art: keyof typeof ART; tint: string }> = {
  Streetwear: { art: "tee", tint: "#E4E2DC" }, Y2K: { art: "tee", tint: "#EAD9D6" }, Workwear: { art: "jacket", tint: "#E6E0D6" },
  Denim: { art: "pants", tint: "#DFE3E6" }, "Vintage sports": { art: "polo", tint: "#DADFE8" }, "Kurtas & ethnic": { art: "kurta", tint: "#E8E1D3" },
  Sneakers: { art: "shoe", tint: "#E9E8E4" }, Bags: { art: "bag", tint: "#E6DFD2" },
};

const SIZE_GROUPS = [
  { name: "Tops", test: (s: string) => /^(XXS|XS|S|M|L|XL|XXL|XXXL)$/i.test(s) },
  { name: "Waist", test: (s: string) => /^W\d+/i.test(s) },
  { name: "Shoes (UK)", test: (s: string) => /^UK/i.test(s) },
];

const Art = ({ d }: { d: string }) => (
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <path d={d} />
  </svg>
);

/** The no-query state of /search (board Explore): categories, styles, sizes and stores. Everything links to a real search. */
export function Explore({
  categoryCounts,
  sizes,
  stores,
  following,
  signedIn,
}: {
  categoryCounts: { category: string; n: number }[];
  sizes: { size: string; n: number }[];
  stores: StoreCardData[];
  following: Set<string>;
  signedIn: boolean;
}) {
  const counts = new Map(categoryCounts.map((c) => [c.category, c.n]));
  const groups = [
    ...SIZE_GROUPS.map((g) => ({ name: g.name, items: sizes.filter((s) => g.test(s.size)) })),
    { name: "Other", items: sizes.filter((s) => !SIZE_GROUPS.some((g) => g.test(s.size))) },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-8 lg:gap-12">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="t-display">Explore</h1>
        <Link href={`/search${searchParamsToQuery({ sort: "newest" })}`} className="btn btn-sm btn-ghost !px-0 !h-11">
          See the newest pieces
        </Link>
      </div>

      <section aria-labelledby="cat-h" className="flex flex-col gap-3">
        <h2 id="cat-h" className="t-h2">
          Categories
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 lg:gap-3">
          {CATEGORIES.map((c, i) => (
            <Link key={c.id} href={`/search${searchParamsToQuery({ categories: [c.id] })}`} className="cat-tile">
              <span className="art" style={{ background: TINTS[i % TINTS.length] }}>
                <Art d={ART[CATEGORY_ART[c.id] ?? "tee"]} />
              </span>
              <span className="flex flex-col">
                <span className="t-small !font-bold leading-tight">{c.label}</span>
                {counts.has(c.id) && <span className="t-caption muted !font-medium">{counts.get(c.id)} in stock</span>}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="sty-h" className="flex flex-col gap-3">
        <h2 id="sty-h" className="t-h2">
          Styles
        </h2>
        <div className="hscroll hscroll-bleed lg:!grid lg:grid-cols-8 lg:!overflow-visible lg:!px-0">
          {BUYER_STYLES.map((s) => (
            <Link key={s} href={`/search${searchParamsToQuery({ q: s })}`} className="tile w-[136px] lg:w-auto" style={{ background: STYLE_ART[s]?.tint }}>
              <span className="img">
                <Art d={ART[STYLE_ART[s]?.art ?? "tee"]} />
              </span>
              <span className="lbl !text-xs">{s}</span>
            </Link>
          ))}
        </div>
      </section>

      {groups.length > 0 && (
        <section aria-labelledby="size-h" className="card overflow-hidden">
          <div className="tape !h-[26px] !rounded-none" aria-hidden="true" />
          <div className="flex flex-col gap-3 p-4 lg:p-6">
            <h2 id="size-h" className="t-h2">
              Shop by size
            </h2>
            {groups.map((g) => (
              <div key={g.name} className="flex flex-col gap-1.5">
                <span className="t-caption muted">{g.name}</span>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map((z) => (
                    <Link key={z.size} href={`/search${searchParamsToQuery({ sizes: [z.size] })}`} className="pill min-h-11 min-w-12 justify-center !no-underline">
                      {z.size}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {stores.length > 0 && (
        <section aria-labelledby="st-h" className="flex flex-col gap-3">
          <h2 id="st-h" className="t-h2">
            Stores
          </h2>
          <div className="card divide-y divide-line lg:grid lg:grid-cols-2 lg:divide-y-0 lg:gap-px lg:overflow-hidden">
            {stores.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-3.5 py-3">
                <Link href={`/s/${s.handle}`} className="flex min-w-0 flex-1 items-center gap-3 !no-underline" style={{ color: "inherit" }}>
                  <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#0D0D0C] text-white">
                    <span className="wordmark text-[13px]">{initials(s.displayName)}</span>
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="t-small !font-bold">{s.displayName}</span>
                    <span className="t-caption muted line-clamp-1 !font-medium">
                      {[s.city, s.rating !== null ? `★ ${s.rating.toFixed(1)} (${s.reviewCount})` : "New on YOLT"].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </Link>
                <FollowChip sellerId={s.id} name={s.displayName} following={following.has(s.id)} signedIn={signedIn} className="!h-11 shrink-0" />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
