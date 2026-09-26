import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import {
  canBookShipment,
  cancelOrderBySeller,
  getSellerOrder,
  getSellerOrderCounts,
  getSellerOrders,
  recordShipmentBooked,
  SELLER_ORDER_TABS,
  type SellerOrderTab,
} from "@yolt/core";
import { orderItems, type Db, type sellers } from "@yolt/db";
import type { AuthVariables } from "../auth";
import { estimatedWeightGrams, type ShippingProvider } from "../shipping/provider";

type Env = { Variables: AuthVariables & { seller: typeof sellers.$inferSelect; userId: string } };

const Any = { content: { "application/json": { schema: z.any() } }, description: "OK" };
const IdParam = z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) });
const TabSchema = z.enum(Object.keys(SELLER_ORDER_TABS) as [SellerOrderTab, ...SellerOrderTab[]]);

/** Mounted under /seller (which resolves the seller in middleware). */
export function sellerOrderRoutes(deps: { db: Db; shipping: ShippingProvider }) {
  const { db, shipping } = deps;
  const app = new OpenAPIHono<Env>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: "INVALID_REQUEST", details: result.error.issues }, 400);
    },
  });

  app.openapi(
    createRoute({
      method: "get",
      path: "/orders",
      summary: "Orders for one tab (to ship first by deadline), with counts for every tab",
      request: { query: z.object({ tab: TabSchema.default("to-ship") }) },
      responses: { 200: Any },
    }),
    async (c) => {
      const sellerId = c.get("seller").id;
      const { tab } = c.req.valid("query");
      const [items, counts] = await Promise.all([getSellerOrders(db, { sellerId, tab }), getSellerOrderCounts(db, sellerId)]);
      return c.json({ tab, counts, items }, 200);
    },
  );

  app.openapi(
    createRoute({ method: "get", path: "/orders/{id}", summary: "Order detail with shipment timeline", request: { params: IdParam }, responses: { 200: Any, 404: Any } }),
    async (c) => {
      const r = await getSellerOrder(db, { sellerId: c.get("seller").id, orderId: c.req.valid("param").id });
      return r ? c.json(r, 200) : c.json({ error: "NOT_FOUND" }, 404);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/orders/{id}/ship",
      summary: "Book a courier pickup and get the shipping label",
      request: { params: IdParam },
      responses: { 200: Any, 404: Any, 409: Any },
    }),
    async (c) => {
      const seller = c.get("seller");
      const orderId = c.req.valid("param").id;
      const can = await canBookShipment(db, { sellerId: seller.id, orderId });
      if (!can.ok) return c.json({ error: can.reason }, can.reason === "NOT_FOUND" ? 404 : 409);
      if (!seller.pickupPincode) return c.json({ error: "PICKUP_ADDRESS_MISSING" }, 409);

      const detail = (await getSellerOrder(db, { sellerId: seller.id, orderId }))!;
      if (!detail.order.shippingAddress) return c.json({ error: "NO_DELIVERY_ADDRESS" }, 409);
      const items = await db.select({ snapshot: orderItems.snapshot }).from(orderItems).where(eq(orderItems.orderId, orderId));

      const created = await shipping.createShipment({
        orderReference: detail.order.reference,
        pickup: { name: seller.displayName, pincode: seller.pickupPincode, state: seller.pickupState },
        delivery: detail.order.shippingAddress,
        weightGrams: items.reduce((g, i) => g + estimatedWeightGrams(i.snapshot.category), 0),
        declaredValuePaise: detail.order.subtotalPaise,
      });
      const r = await recordShipmentBooked(db, {
        sellerId: seller.id,
        orderId,
        actorUserId: c.get("userId"),
        booking: { provider: shipping.name, ...created },
      });
      if (!r.ok) {
        // Lost a race with a second click: don't leave a stray booking with the courier.
        await shipping.cancelShipment(created.providerShipmentId).catch(() => {});
        return c.json({ error: r.reason }, r.reason === "NOT_FOUND" ? 404 : 409);
      }
      return c.json({ awb: created.awb, courierName: created.courierName, labelUrl: created.labelUrl, pickupScheduledFor: created.pickupScheduledFor }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/orders/{id}/cancel",
      summary: "Cancel before pickup (the buyer is refunded in full)",
      request: {
        params: IdParam,
        body: { content: { "application/json": { schema: z.object({ reason: z.string().trim().min(3).max(300) }) } } },
      },
      responses: { 200: Any, 400: Any, 404: Any, 409: Any },
    }),
    async (c) => {
      const r = await cancelOrderBySeller(db, {
        sellerId: c.get("seller").id,
        orderId: c.req.valid("param").id,
        actorUserId: c.get("userId"),
        reason: c.req.valid("json").reason,
      });
      if (!r.ok) return c.json({ error: r.reason }, r.reason === "NOT_FOUND" ? 404 : 409);
      if (r.shipmentToCancel) await shipping.cancelShipment(r.shipmentToCancel.providerShipmentId).catch(() => {});
      return c.json({ ok: true, refundId: r.refundId }, 200);
    },
  );

  return app;
}
