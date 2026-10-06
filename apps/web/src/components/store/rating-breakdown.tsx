import { Stars } from "@/components/stars";

type Rating = { total: number; average: number; accuracy: number | null; breakdown: { stars: number; n: number }[] };

/**
 * RatingBreakdown (board C5): the overall score, how many reviews gave each number of stars, and the
 * "matched the listing" score. The bars are width only; the counts carry the information.
 */
export function RatingBreakdown({ rating }: { rating: Rating }) {
  return (
    <div className="card grid grid-cols-[110px_minmax(0,1fr)] items-center gap-4 p-4 lg:grid-cols-1 lg:gap-2.5 lg:p-5">
      <div className="flex flex-col gap-1 lg:flex-row lg:flex-wrap lg:items-baseline lg:gap-x-2.5">
        <span className="t-display !text-[44px] !leading-[44px] lg:!text-[52px] lg:!leading-[50px]">{rating.average.toFixed(1)}</span>
        <Stars rating={rating.average} size={14} className="lg:hidden" />
        <span className="t-caption muted lg:!text-sm lg:!font-medium">
          {rating.total} {rating.total === 1 ? "review" : "reviews"}
        </span>
        {rating.accuracy !== null && (
          <span className="t-small mt-1.5 font-bold lg:hidden">
            {rating.accuracy.toFixed(1)} <span className="muted font-medium">matched the listing</span>
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-1.5 lg:gap-2">
        {rating.breakdown.map((b) => (
          <li key={b.stars} className="flex items-center gap-2">
            <span className="t-mono w-6 !text-[11px] lg:w-[22px] lg:!text-xs">
              <span aria-hidden="true">{b.stars}★</span>
              <span className="sr-only">{b.stars} stars</span>
            </span>
            <span className="bar !h-1.5 grow lg:!h-2" aria-hidden="true">
              <span style={{ width: `${(b.n / rating.total) * 100}%` }} />
            </span>
            <span className="t-mono muted w-8 text-right !text-[11px] lg:!text-xs">
              {b.n}
              <span className="sr-only"> {b.n === 1 ? "review" : "reviews"}</span>
            </span>
          </li>
        ))}
      </ul>
      {rating.accuracy !== null && (
        <>
          <div className="divider hidden lg:block" />
          <p className="t-small hidden justify-between lg:flex">
            <span>Matched the listing</span>
            <span className="font-bold">{rating.accuracy.toFixed(1)} / 5</span>
          </p>
        </>
      )}
    </div>
  );
}
