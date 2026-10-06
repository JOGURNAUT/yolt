"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ICON_STROKE } from "@/components/ui/cx";
import { RatingBreakdown } from "./rating-breakdown";
import { ReviewCard, type ReviewView } from "./review-card";

const FIRST = 3;
const STEP = 5;

type Rating = { total: number; average: number | null; accuracy: number | null; breakdown: { stars: number; n: number }[] };

/**
 * Reviews at the bottom of the store page (decision D7): the rating breakdown, then the newest
 * reviews with "Show more reviews". Reviews belong to the store, so they stay after pieces sell.
 */
export function ReviewsSection({ rating, reviews, storeName }: { rating: Rating; reviews: ReviewView[]; storeName: string }) {
  const [shown, setShown] = useState(FIRST);
  const visible = reviews.slice(0, shown);

  return (
    <section id="reviews" aria-labelledby="reviews-h" className="grid scroll-mt-4 gap-3.5 lg:grid-cols-12 lg:gap-6">
      <div className="flex flex-col gap-3.5 lg:col-span-4">
        <div className="sec-head">
          <h2 id="reviews-h" className="t-h2">
            Reviews
          </h2>
          <span className="t-caption muted lg:hidden">Verified purchases only</span>
        </div>
        {rating.average !== null && <RatingBreakdown rating={{ ...rating, average: rating.average }} />}
        <span className="t-caption muted hidden lg:block">Verified purchases only. Each review shows the piece that was bought.</span>
      </div>

      <div className="flex flex-col gap-3.5 lg:col-span-8 lg:pt-[42px]">
        {reviews.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 px-4 py-6 text-center">
            <span aria-hidden="true" className="inline-flex gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="ic ic-16" strokeWidth={ICON_STROKE} />
              ))}
            </span>
            <p className="t-h3">No reviews yet</p>
            <p className="t-small muted">Reviews come only from buyers who received an order from this store.</p>
          </div>
        ) : (
          <>
            {visible.map((r) => (
              <ReviewCard key={r.id} review={r} storeName={storeName} />
            ))}
            {shown < reviews.length && (
              <Button variant="secondary" onClick={() => setShown((n) => n + STEP)} className="lg:self-start">
                Show more reviews
              </Button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
