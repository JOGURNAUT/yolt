import { and, desc, eq } from "drizzle-orm";
import { outboxEvents, paymentAttempts, refunds, type Tx } from "@yolt/db";

/**
 * Records a full refund of the order's successful payment and queues it for the payment
 * provider. Returns null when nothing was paid. Callers hold the order row lock.
 */
export async function requestFullRefund(tx: Tx, input: { orderId: string; reason: string }): Promise<string | null> {
  const [paid] = await tx
    .select()
    .from(paymentAttempts)
    .where(and(eq(paymentAttempts.orderId, input.orderId), eq(paymentAttempts.status, "SUCCEEDED")))
    .orderBy(desc(paymentAttempts.createdAt))
    .limit(1);
  if (!paid) return null;
  const [refund] = await tx
    .insert(refunds)
    .values({ orderId: input.orderId, paymentAttemptId: paid.id, amountPaise: paid.amountPaise, reason: input.reason })
    .returning({ id: refunds.id });
  await tx.insert(outboxEvents).values({
    type: "refund.requested",
    payload: { refundId: refund!.id, orderId: input.orderId, reason: input.reason },
  });
  return refund!.id;
}
