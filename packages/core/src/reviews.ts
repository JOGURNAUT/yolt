import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { orderItems, orders, reviews, type Db } from "@yolt/db";

/**
 * Verified reviews (decision D7): only the buyer of a delivered order can review, once per
 * item, and the seller can reply once. Reviews live on the store page because listings sell.
 */

export const MAX_REVIEW_PHOTOS = 3;
const REVIEWABLE = ["DELIVERED", "CLOSED"] as const;

export type CreateReviewResult =
  | { ok: true; reviewId: string }
  | { ok: false; reason: "NOT_FOUND" | "NOT_DELIVERED" | "ALREADY_REVIEWED" | "INVALID" };

export async function createReview(
  db: Db,
  input: {
    buyerId: string;
    orderItemId: string;
    rating: number;
    accuracyRating?: number | null;
    body?: string | null;
    photoUrls?: string[];
    now?: Date;
  },
): Promise<CreateReviewResult> {
  const valid = (r: number) => Number.isInteger(r) && r >= 1 && r <= 5;
  if (!valid(input.rating) || (input.accuracyRating != null && !valid(input.accuracyRating))) return { ok: false, reason: "INVALID" };
  const body = input.body?.trim() || null;
  if ((body?.length ?? 0) > 1000 || (input.photoUrls?.length ?? 0) > MAX_REVIEW_PHOTOS) return { ok: false, reason: "INVALID" };

  const [row] = await db
    .select({ item: orderItems, order: orders })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orderItems.id, input.orderItemId), eq(orders.buyerId, input.buyerId)));
  if (!row) return { ok: false, reason: "NOT_FOUND" };
  if (!(REVIEWABLE as readonly string[]).includes(row.order.status)) return { ok: false, reason: "NOT_DELIVERED" };

  const inserted = await db
    .insert(reviews)
    .values({
      orderItemId: row.item.id,
      sellerId: row.order.sellerId,
      buyerId: input.buyerId,
      rating: input.rating,
      accuracyRating: input.accuracyRating ?? null,
      body,
      photoUrls: input.photoUrls ?? [],
      createdAt: input.now ?? new Date(),
    })
    .onConflictDoNothing({ target: reviews.orderItemId })
    .returning({ id: reviews.id });
  return inserted.length ? { ok: true, reviewId: inserted[0]!.id } : { ok: false, reason: "ALREADY_REVIEWED" };
}

export async function replyToReview(db: Db, input: { sellerId: string; reviewId: string; reply: string; now?: Date }) {
  const reply = input.reply.trim();
  if (reply.length < 1 || reply.length > 500) return { ok: false as const, reason: "INVALID" as const };
  const r = await db
    .update(reviews)
    .set({ sellerReply: reply, sellerRepliedAt: input.now ?? new Date() })
    .where(and(eq(reviews.id, input.reviewId), eq(reviews.sellerId, input.sellerId), isNull(reviews.sellerReply)))
    .returning({ id: reviews.id });
  return r.length ? ({ ok: true } as const) : ({ ok: false, reason: "NOT_FOUND_OR_REPLIED" } as const);
}

/** Items in a delivered order the buyer hasn't reviewed yet. */
export async function getReviewableItems(db: Db, input: { buyerId: string; orderId: string }) {
  const rows = await db
    .select({ item: orderItems, reviewId: reviews.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .leftJoin(reviews, eq(reviews.orderItemId, orderItems.id))
    .where(and(eq(orders.id, input.orderId), eq(orders.buyerId, input.buyerId), inArray(orders.status, [...REVIEWABLE])))
    .orderBy(asc(orderItems.id));
  return rows.filter((r) => r.reviewId === null).map((r) => r.item);
}

/** Reviews on this seller's store that don't have a reply yet. */
export async function getUnrepliedReviews(db: Db, sellerId: string) {
  return db
    .select({ review: reviews, item: orderItems.snapshot })
    .from(reviews)
    .innerJoin(orderItems, eq(orderItems.id, reviews.orderItemId))
    .where(and(eq(reviews.sellerId, sellerId), isNull(reviews.sellerReply)))
    .orderBy(asc(reviews.createdAt));
}
