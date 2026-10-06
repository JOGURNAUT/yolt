import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getBuyerOrder } from "@yolt/core";
import { listings, orderItems } from "@yolt/db";
import { db } from "./db";

/** What the checkout screens need beyond the order API: who the seller is and where each piece lives. */
export async function getCheckoutContext(userId: string, orderId: string) {
  const data = await getBuyerOrder(db, { buyerId: userId, orderId });
  if (!data) return null;
  const lines = await db
    .select({ listingId: orderItems.listingId, slug: listings.slug })
    .from(orderItems)
    .innerJoin(listings, and(eq(listings.id, orderItems.listingId)))
    .where(inArray(orderItems.orderId, [orderId]));
  return {
    sellerName: data.sellerName,
    sellerHandle: data.sellerHandle,
    slugs: Object.fromEntries(lines.map((l) => [l.listingId, l.slug])) as Record<string, string>,
  };
}
