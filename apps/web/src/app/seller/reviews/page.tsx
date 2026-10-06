import type { Metadata } from "next";
import { connection } from "next/server";
import { getUnrepliedReviews } from "@yolt/core";
import { ReviewReply } from "@/components/seller/claim-response";
import { Stars } from "@/components/stars";
import { db } from "@/lib/server/db";
import { requireSeller } from "@/lib/server/session";

export const metadata: Metadata = { title: "Reviews", robots: { index: false } };

export default async function SellerReviewsPage() {
  await connection();
  const current = await requireSeller("/seller/reviews");
  const pending = await getUnrepliedReviews(db, current.seller.id);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Reviews to reply to</h1>
      {pending.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">You&apos;ve replied to every review.</p>
      ) : (
        <ul className="space-y-3">
          {pending.map(({ review, item }) => (
            <li key={review.id} className="rounded-lg border border-line bg-surface p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{item.title}</span>
                <Stars rating={review.rating} />
              </div>
              {review.body && <p className="mt-2">{review.body}</p>}
              <ReviewReply reviewId={review.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
