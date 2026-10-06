import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { RatingBreakdown } from "@/components/store/rating-breakdown";
import { ReviewCard } from "@/components/store/review-card";
import { ReviewReply } from "@/components/seller/claim-response";
import { PageHeader } from "@/components/seller/page-header";
import { Stars } from "@/components/stars";
import { cx } from "@/components/ui/cx";
import { formatINR } from "@/lib/format";
import { getStoreReviews } from "@/lib/server/queries";
import { requireSeller } from "@/lib/server/session";
import { firstName, formatDay } from "@/lib/store-format";

export const metadata: Metadata = { title: "Reviews", robots: { index: false } };

export default async function SellerReviewsPage({ searchParams }: PageProps<"/seller/reviews">) {
  await connection();
  const current = await requireSeller("/seller/reviews");
  const all = (await searchParams).tab === "all";
  const data = await getStoreReviews(current.seller.id);
  const pending = data.reviews.filter((r) => !r.sellerReply);
  const shown = all ? data.reviews : pending;

  return (
    <>
      <PageHeader title="Reviews" kicker="Only buyers who received a piece can review it. You can reply once to each review; replies are public." />
      <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        {data.average !== null && <RatingBreakdown rating={{ ...data, average: data.average }} />}
        <div className="flex flex-col gap-3.5">
          <nav aria-label="Review filter" className="flex gap-2">
            <Link href="/seller/reviews" aria-current={!all ? "page" : undefined} className={cx("pill !no-underline", !all && "is-active")}>
              Needs a reply <span className="n">{pending.length}</span>
            </Link>
            <Link href="/seller/reviews?tab=all" aria-current={all ? "page" : undefined} className={cx("pill !no-underline", all && "is-active")}>
              All <span className="n">{data.reviews.length}</span>
            </Link>
          </nav>
          {shown.length === 0 ? (
            <p className="t-small muted py-10 text-center">{all ? "No reviews yet." : "You've replied to every review."}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
              {shown.map((r) => (
                <li key={r.id}>
                  {r.sellerReply ? (
                    <ReviewCard review={r} storeName={current.seller.displayName} />
                  ) : (
                    <article className="card flex flex-col gap-2.5 p-4 !shadow-[inset_0_0_0_2px_var(--foreground)] lg:p-[18px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="t-h3">{firstName(r.buyerName)}</span>
                        <span className="t-small muted">{formatDay(r.createdAt)}</span>
                      </div>
                      <Stars rating={r.rating} />
                      {r.body && <p className="t-body">{r.body}</p>}
                      <p className="t-small muted">
                        Bought: {r.item.title} · {[r.item.tagSize, formatINR(r.itemPricePaise)].filter(Boolean).join(" · ")}
                      </p>
                      <ReviewReply reviewId={r.id} />
                    </article>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
