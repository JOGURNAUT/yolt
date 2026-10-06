import { sql } from "drizzle-orm";
import { claims, orders, refunds, type Db } from "@yolt/db";

/**
 * Seller payouts statement (docs/user-flows.md S-F9). There is no payouts table yet: everything
 * is derived from orders, refunds and claims, so the numbers can't drift from the order history.
 *
 * Definitions (all amounts integer paise):
 * - A statement row is an order the buyer has paid for and that wasn't cancelled: status
 *   CONFIRMED, PACKED, SHIPPED, DELIVERED or CLOSED. Cancelled, expired and NEEDS_REFUND orders
 *   are never owed to the seller.
 * - gross = items + shipping (buyers pay no platform fee, D13).
 * - commission = 0 for every order in the pilot, whichever the source. Later, only YOLT_DISCOVERY
 *   orders will carry one (D13, D16); `source` is already recorded on each order.
 * - refunded = every refund recorded against the order (a refund the provider hasn't completed yet
 *   is still money the buyer is owed, so it counts).
 * - net = max(0, gross - commission - refunded).
 * - PENDING: not past the buyer-protection window yet, meaning the order isn't CLOSED (closing happens
 *   48 h after delivery), or it has an open or escalated claim, even if it is CLOSED.
 * - AVAILABLE: CLOSED, no open claim, and not paid out yet.
 * - paidOut: 0 for now. TODO: when the payment provider's settlement (Cashfree Easy Split) is wired
 *   up, record each settlement, subtract it from available and add it here.
 */

export const PAYOUT_PAGE_SIZE = 20;
export const PAYOUT_MAX_PAGE_SIZE = 50;
/** Commission is 0 in the pilot. */
export const PILOT_COMMISSION_PAISE = 0;

export const ORDER_SOURCE_LABELS = { SELLER_LINK: "Your link", YOLT_DISCOVERY: "Found on YOLT" } as const;
const PAID_STATUSES = sql`('CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CLOSED')`;

export type PayoutBucket = "PENDING" | "AVAILABLE";

export type PayoutRow = {
  orderId: string;
  reference: string;
  /** When the payment was confirmed. */
  date: Date;
  itemsPaise: number;
  shippingPaise: number;
  source: (typeof orders.$inferSelect)["source"];
  sourceLabel: string;
  commissionPaise: number;
  refundedPaise: number;
  netPaise: number;
  bucket: PayoutBucket;
};

export type PayoutStatement = {
  balances: { pendingPaise: number; availablePaise: number; paidOutPaise: number };
  rows: PayoutRow[];
  page: number;
  pageSize: number;
  total: number;
};

/** One row per statement order with its refunds, bucket and net, as a SQL fragment. */
const statementSql = (sellerId: string) => sql`
  SELECT o.id, o.reference, o.confirmed_at, o.subtotal_paise, o.shipping_paise, o.source,
    COALESCE((SELECT sum(r.amount_paise) FROM ${refunds} r WHERE r.order_id = o.id), 0)::int AS refunded_paise,
    (o.status = 'CLOSED' AND NOT EXISTS (
      SELECT 1 FROM ${claims} c WHERE c.order_id = o.id AND c.status IN ('OPEN', 'ESCALATED'))) AS is_available
  FROM ${orders} o
  WHERE o.seller_id = ${sellerId} AND o.status IN ${PAID_STATUSES} AND o.confirmed_at IS NOT NULL`;

type DbRow = {
  id: string;
  reference: string;
  confirmed_at: Date;
  subtotal_paise: number;
  shipping_paise: number;
  source: PayoutRow["source"];
  refunded_paise: number;
  is_available: boolean;
  total: number;
};

export function netPaise(row: { itemsPaise: number; shippingPaise: number; commissionPaise: number; refundedPaise: number }) {
  return Math.max(0, row.itemsPaise + row.shippingPaise - row.commissionPaise - row.refundedPaise);
}

export async function getPayoutStatement(
  db: Db,
  input: { sellerId: string; page?: number; pageSize?: number },
): Promise<PayoutStatement> {
  const pageSize = Math.min(Math.max(1, Math.floor(input.pageSize ?? PAYOUT_PAGE_SIZE)), PAYOUT_MAX_PAGE_SIZE);
  const page = Math.max(1, Math.floor(input.page ?? 1));

  const [balance] = await db.execute<{ pending: number; available: number }>(sql`
    SELECT
      COALESCE(sum(GREATEST(0, s.subtotal_paise + s.shipping_paise - ${PILOT_COMMISSION_PAISE} - s.refunded_paise)) FILTER (WHERE NOT s.is_available), 0)::bigint AS pending,
      COALESCE(sum(GREATEST(0, s.subtotal_paise + s.shipping_paise - ${PILOT_COMMISSION_PAISE} - s.refunded_paise)) FILTER (WHERE s.is_available), 0)::bigint AS available
    FROM (${statementSql(input.sellerId)}) s`);

  const dbRows = await db.execute<DbRow>(sql`
    SELECT s.*, count(*) OVER ()::int AS total
    FROM (${statementSql(input.sellerId)}) s
    ORDER BY s.confirmed_at DESC, s.id
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);

  const rows: PayoutRow[] = [...dbRows].map((r) => {
    const base = {
      itemsPaise: r.subtotal_paise,
      shippingPaise: r.shipping_paise,
      commissionPaise: PILOT_COMMISSION_PAISE,
      refundedPaise: r.refunded_paise,
    };
    return {
      orderId: r.id,
      reference: r.reference,
      date: new Date(r.confirmed_at),
      ...base,
      source: r.source,
      sourceLabel: ORDER_SOURCE_LABELS[r.source],
      netPaise: netPaise(base),
      bucket: r.is_available ? "AVAILABLE" : "PENDING",
    };
  });

  return {
    // `sum` of integers comes back as a bigint string from the driver.
    balances: { pendingPaise: Number(balance!.pending), availablePaise: Number(balance!.available), paidOutPaise: 0 },
    rows,
    page,
    pageSize,
    total: dbRows[0]?.total ?? 0,
  };
}
