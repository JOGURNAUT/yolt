import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import {
  applyTrackingEvent,
  cancelOrderForLateDispatch,
  closeDeliveredOrders,
  createCheckout,
  createSession,
  getBuyerOrder,
  getBuyerOrders,
  lateCancelAvailableAt,
  getAddress,
  setOrderShippingAddress,
  expireHolds,
  handlePaymentEvent,
  parseFirstTouch,
  releaseCheckout,
  revokeSession,
  searchListings,
  startPayment,
  type AuthSecrets,
} from "@yolt/core";
import { asComplete, holds, listings, orderItems, orders, paymentAttempts, sellers, shipments, users, type Db } from "@yolt/db";
import { FIRST_TOUCH_COOKIE, parseSearchParams } from "@yolt/shared";
import { SESSION_COOKIE, sameOriginMiddleware, sessionMiddleware, type AuthVariables } from "./auth";
import type { OtpSender } from "./otp/sender";
import { authRoutes, setSessionCookie } from "./routes/auth";
import { WebhookVerificationError, type PaymentProvider } from "./payments/provider";
import type { MediaStorage } from "./media/storage";
import type { SandboxPaymentProvider } from "./payments/sandbox";
import { addressRoutes } from "./routes/addresses";
import { sellerRoutes } from "./routes/seller";
import {
  DevShippingProvider,
  estimatedWeightGrams,
  NEXT_DEV_STATUS,
  ShippingUnavailableError,
  TrackingVerificationError,
  type ShippingProvider,
} from "./shipping/provider";

export type AppDeps = {
  db: Db;
  payments: PaymentProvider;
  media: MediaStorage;
  /** Present only outside production: lets the local UI "complete" a payment. */
  sandbox?: SandboxPaymentProvider;
  otp: OtpSender;
  authSecrets: AuthSecrets;
  /** Development conveniences: one-click login as any user, visible OTP codes. Must be false in production. */
  allowDevAuth: boolean;
  /** Mark cookies Secure. Defaults to true unless dev auth is on. */
  secureCookies?: boolean;
  /** Extra origins allowed to make state-changing requests (e.g. a future app domain). */
  allowedOrigins?: string[];
  cronSecret?: string;
  shipping: ShippingProvider;
};

const ErrorSchema = z.object({ error: z.string(), details: z.unknown().optional() }).openapi("Error");
const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});
const Uuid = z.string().uuid();

export function createApp(deps: AppDeps) {
  const { db, payments } = deps;
  const app = new OpenAPIHono<{ Variables: AuthVariables }>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: "INVALID_REQUEST", details: result.error.issues }, 400);
    },
  }).basePath("/api");

  const secureCookies = deps.secureCookies ?? !deps.allowDevAuth;
  app.use("*", sameOriginMiddleware(deps.allowedOrigins ?? []));
  app.use("*", sessionMiddleware(db));
  const requireUser = (c: { get: (key: "session") => AuthVariables["session"] }) => c.get("session");

  app.route(
    "/auth",
    authRoutes({ db, secrets: deps.authSecrets, otp: deps.otp, secureCookies, exposeDevCodes: deps.allowDevAuth }),
  );

  // -------------------------------------------------------------------------
  // Checkout
  // -------------------------------------------------------------------------

  app.openapi(
    createRoute({
      method: "post",
      path: "/checkout",
      summary: "Hold items for the buyer and create an order awaiting payment",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                listingIds: z.array(Uuid).min(1).max(10),
                expectedSubtotalPaise: z.number().int().positive().optional(),
              }),
            },
          },
        },
      },
      responses: {
        201: json(
          z.object({ orderId: Uuid, reference: z.string(), totalPaise: z.number(), expiresAt: z.string() }),
          "Items held",
        ),
        400: json(ErrorSchema, "Invalid checkout"),
        401: json(ErrorSchema, "Sign in required"),
        409: json(ErrorSchema, "Unavailable or price changed"),
      },
    }),
    async (c) => {
      const session = requireUser(c);
      if (!session) return c.json({ error: "SIGN_IN_REQUIRED" }, 401);
      const body = c.req.valid("json");
      const r = await createCheckout(db, {
        buyerId: session.userId,
        ...body,
        firstTouch: parseFirstTouch(getCookie(c, FIRST_TOUCH_COOKIE)),
      });
      if (r.ok) {
        return c.json(
          { orderId: r.orderId, reference: r.reference, totalPaise: r.totalPaise, expiresAt: r.expiresAt.toISOString() },
          201,
        );
      }
      if (r.reason === "UNAVAILABLE") return c.json({ error: r.reason, details: { unavailableListingIds: r.unavailableListingIds } }, 409);
      if (r.reason === "PRICE_CHANGED") return c.json({ error: r.reason, details: { subtotalPaise: r.subtotalPaise } }, 409);
      return c.json({ error: r.reason }, 400);
    },
  );

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  const OrderParams = z.object({ id: Uuid.openapi({ param: { name: "id", in: "path" } }) });

  app.openapi(
    createRoute({
      method: "get",
      path: "/orders/{id}",
      summary: "Order status for its buyer (used by the payment status screen)",
      request: { params: OrderParams },
      responses: {
        200: json(z.any(), "Order"),
        401: json(ErrorSchema, "Sign in required"),
        404: json(ErrorSchema, "Not found"),
      },
    }),
    async (c) => {
      const session = requireUser(c);
      if (!session) return c.json({ error: "SIGN_IN_REQUIRED" }, 401);
      const { id } = c.req.valid("param");
      const [order] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.buyerId, session.userId)));
      if (!order) return c.json({ error: "NOT_FOUND" }, 404);
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.id));
      const orderHolds = await db.select().from(holds).where(eq(holds.orderId, id));
      const attempts = await db.select().from(paymentAttempts).where(eq(paymentAttempts.orderId, id));
      const activeExpiry = orderHolds.filter((h) => h.status === "ACTIVE").map((h) => h.expiresAt.getTime());
      return c.json(
        {
          id: order.id,
          reference: order.reference,
          status: order.status,
          subtotalPaise: order.subtotalPaise,
          shippingPaise: order.shippingPaise,
          totalPaise: order.totalPaise,
          dispatchBy: order.dispatchBy?.toISOString() ?? null,
          holdExpiresAt: activeExpiry.length ? new Date(Math.min(...activeExpiry)).toISOString() : null,
          payment: attempts.at(-1)?.status ?? null,
          shippingAddress: order.shippingAddress ?? null,
          items: items.map((i) => ({ listingId: i.listingId, pricePaise: i.pricePaise, ...i.snapshot })),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/orders/{id}/pay",
      summary: "Start (or resume) payment for an order",
      request: { params: OrderParams },
      responses: {
        200: json(
          z.object({
            paymentAttemptId: Uuid,
            providerOrderId: z.string(),
            provider: z.string(),
            sessionId: z.string(),
            redirectUrl: z.string().optional(),
            amountPaise: z.number(),
            holdExpiresAt: z.string(),
            resumed: z.boolean(),
          }),
          "Payment session",
        ),
        401: json(ErrorSchema, "Sign in required"),
        404: json(ErrorSchema, "Not found"),
        409: json(ErrorSchema, "Order can't be paid"),
      },
    }),
    async (c) => {
      const session = requireUser(c);
      if (!session) return c.json({ error: "SIGN_IN_REQUIRED" }, 401);
      const { id } = c.req.valid("param");
      const [order] = await db
        .select({ reference: orders.reference, currency: orders.currency })
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.buyerId, session.userId)));
      if (!order) return c.json({ error: "NOT_FOUND" }, 404);

      const attemptNo = (await db.select({ id: paymentAttempts.id }).from(paymentAttempts).where(eq(paymentAttempts.orderId, id))).length + 1;
      const started = await startPayment(db, {
        orderId: id,
        buyerId: session.userId,
        provider: payments.name,
        providerOrderId: `${order.reference}-${attemptNo}`,
      });
      if (!started.ok) {
        return c.json({ error: started.reason }, started.reason === "NOT_FOUND" ? 404 : 409);
      }
      const payment = await payments.createSession({
        providerOrderId: started.providerOrderId,
        amountPaise: started.amountPaise,
        currency: order.currency,
        orderReference: order.reference,
        buyerId: session.userId,
      });
      return c.json(
        {
          paymentAttemptId: started.paymentAttemptId,
          providerOrderId: started.providerOrderId,
          provider: payments.name,
          sessionId: payment.sessionId,
          redirectUrl: payment.redirectUrl,
          amountPaise: started.amountPaise,
          holdExpiresAt: started.holdExpiresAt.toISOString(),
          resumed: started.existing,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/orders/{id}/cancel",
      summary: "Buyer leaves checkout; releases the hold if no payment is in flight",
      request: { params: OrderParams },
      responses: {
        200: json(z.object({ ok: z.boolean() }), "Result"),
        401: json(ErrorSchema, "Sign in required"),
      },
    }),
    async (c) => {
      const session = requireUser(c);
      if (!session) return c.json({ error: "SIGN_IN_REQUIRED" }, 401);
      const r = await releaseCheckout(db, { orderId: c.req.valid("param").id, buyerId: session.userId });
      return c.json({ ok: r.ok }, 200);
    },
  );

  app.openapi(
    createRoute({ method: "get", path: "/orders", summary: "The buyer's paid orders, newest first", responses: { 200: json(z.any(), "Orders"), 401: json(ErrorSchema, "Sign in required") } }),
    async (c) => {
      const session = requireUser(c);
      if (!session) return c.json({ error: "SIGN_IN_REQUIRED" }, 401);
      return c.json(await getBuyerOrders(db, session.userId), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/orders/{id}/tracking",
      summary: "Order with shipment timeline, for the buyer's order page",
      request: { params: OrderParams },
      responses: { 200: json(z.any(), "Order"), 401: json(ErrorSchema, "Sign in required"), 404: json(ErrorSchema, "Not found") },
    }),
    async (c) => {
      const session = requireUser(c);
      if (!session) return c.json({ error: "SIGN_IN_REQUIRED" }, 401);
      const r = await getBuyerOrder(db, { buyerId: session.userId, orderId: c.req.valid("param").id });
      if (!r) return c.json({ error: "NOT_FOUND" }, 404);
      return c.json({ ...r, lateCancelAvailableAt: lateCancelAvailableAt(r.order)?.toISOString() ?? null }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/orders/{id}/cancel-late",
      summary: "Cancel for a full refund when the seller missed the dispatch deadline",
      request: { params: OrderParams },
      responses: { 200: json(z.any(), "Cancelled"), 401: json(ErrorSchema, "Sign in required"), 404: json(ErrorSchema, "Not found"), 409: json(ErrorSchema, "Not yet") },
    }),
    async (c) => {
      const session = requireUser(c);
      if (!session) return c.json({ error: "SIGN_IN_REQUIRED" }, 401);
      const r = await cancelOrderForLateDispatch(db, { buyerId: session.userId, orderId: c.req.valid("param").id });
      if (!r.ok) return c.json({ error: r.reason }, r.reason === "NOT_FOUND" ? 404 : 409);
      if (r.shipmentToCancel) await deps.shipping.cancelShipment(r.shipmentToCancel.providerShipmentId).catch(() => {});
      return c.json({ ok: true }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/orders/{id}/address",
      summary: "Choose the delivery address (checked for serviceability; frozen once payment starts)",
      request: {
        params: OrderParams,
        body: { content: { "application/json": { schema: z.object({ addressId: Uuid }) } } },
      },
      responses: {
        200: json(z.object({ etaDaysMin: z.number(), etaDaysMax: z.number() }), "Address set"),
        401: json(ErrorSchema, "Sign in required"),
        404: json(ErrorSchema, "Order or address not found"),
        409: json(ErrorSchema, "Not deliverable, or payment already started"),
      },
    }),
    async (c) => {
      const session = requireUser(c);
      if (!session) return c.json({ error: "SIGN_IN_REQUIRED" }, 401);
      const { id } = c.req.valid("param");
      const address = await getAddress(db, { userId: session.userId, addressId: c.req.valid("json").addressId });
      if (!address) return c.json({ error: "ADDRESS_NOT_FOUND" }, 404);

      const [order] = await db
        .select({ pickupPincode: sellers.pickupPincode, status: orders.status })
        .from(orders)
        .innerJoin(sellers, eq(sellers.id, orders.sellerId))
        .where(and(eq(orders.id, id), eq(orders.buyerId, session.userId)));
      if (!order) return c.json({ error: "NOT_FOUND" }, 404);
      // Cheap state checks before calling the courier API; setOrderShippingAddress re-checks atomically.
      if (order.status !== "AWAITING_PAYMENT") return c.json({ error: "NOT_AWAITING_PAYMENT" }, 409);
      const [paying] = await db
        .select({ id: paymentAttempts.id })
        .from(paymentAttempts)
        .where(and(eq(paymentAttempts.orderId, id), inArray(paymentAttempts.status, ["PENDING", "UNKNOWN"])));
      if (paying) return c.json({ error: "PAYMENT_IN_PROGRESS" }, 409);
      if (!order.pickupPincode) return c.json({ error: "SELLER_PICKUP_UNKNOWN" }, 409);

      const items = await db.select({ snapshot: orderItems.snapshot }).from(orderItems).where(eq(orderItems.orderId, id));
      const weightGrams = items.reduce((g, i) => g + estimatedWeightGrams(i.snapshot.category), 0);
      const check = await deps.shipping.checkServiceability({
        pickupPincode: order.pickupPincode,
        deliveryPincode: address.pincode,
        weightGrams,
      });
      if (!check.serviceable) return c.json({ error: "NOT_SERVICEABLE", details: { reason: check.reason } }, 409);

      const r = await setOrderShippingAddress(db, {
        orderId: id,
        buyerId: session.userId,
        address: {
          name: address.name,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2,
          landmark: address.landmark,
          city: address.city,
          state: address.state,
          pincode: address.pincode,
        },
      });
      if (!r.ok) return c.json({ error: r.reason }, r.reason === "NOT_FOUND" ? 404 : 409);
      return c.json({ etaDaysMin: check.etaDaysMin, etaDaysMax: check.etaDaysMax }, 200);
    },
  );

  // -------------------------------------------------------------------------
  // Search (public). Same URL parameters as the /search page.
  // -------------------------------------------------------------------------

  app.get("/search", async (c) => {
    const params = parseSearchParams(new URL(c.req.url).searchParams);
    c.header("Cache-Control", "public, max-age=30");
    return c.json(await searchListings(db, params));
  });

  // -------------------------------------------------------------------------
  // Shipping (public): "Delivers to 411001 in 3–5 days"
  // -------------------------------------------------------------------------

  app.openapi(
    createRoute({
      method: "get",
      path: "/shipping/check",
      summary: "Can this listing be delivered to a pincode, and roughly when?",
      request: {
        query: z.object({ listingId: Uuid, pincode: z.string().regex(/^[1-9]\d{5}$/, "6-digit pincode") }),
      },
      responses: { 200: json(z.any(), "Serviceability"), 400: json(ErrorSchema, "Invalid"), 404: json(ErrorSchema, "Not found") },
    }),
    async (c) => {
      const { listingId, pincode } = c.req.valid("query");
      const [row] = await db
        .select({ listing: listings, pickupPincode: sellers.pickupPincode })
        .from(listings)
        .innerJoin(sellers, eq(sellers.id, listings.sellerId))
        .where(eq(listings.id, listingId));
      if (!row || row.listing.status === "DRAFT") return c.json({ error: "NOT_FOUND" }, 404);
      if (!row.pickupPincode) return c.json({ serviceable: false, reason: "SELLER_PICKUP_UNKNOWN" }, 200);
      const check = await deps.shipping.checkServiceability({
        pickupPincode: row.pickupPincode,
        deliveryPincode: pincode,
        weightGrams: estimatedWeightGrams(asComplete(row.listing).category),
      });
      c.header("Cache-Control", "public, max-age=3600");
      return c.json({ pincode, ...check }, 200);
    },
  );

  // -------------------------------------------------------------------------
  // Webhooks — the only thing that confirms a payment
  // -------------------------------------------------------------------------

  const processWebhook = async (request: Request) => {
    let event;
    try {
      event = await payments.parseWebhook(request);
    } catch (err) {
      if (err instanceof WebhookVerificationError) return { status: 401 as const, body: { error: "INVALID_SIGNATURE" } };
      throw err;
    }
    if (!event) return { status: 200 as const, body: { status: "IGNORED" } };
    const result = await handlePaymentEvent(db, event);
    // 200 for every handled outcome, including duplicates, so the provider stops retrying.
    return { status: 200 as const, body: result };
  };

  const processTracking = async (request: Request) => {
    let event;
    try {
      event = await deps.shipping.parseTrackingWebhook(request);
    } catch (err) {
      if (err instanceof TrackingVerificationError) return { status: 401 as const, body: { error: "INVALID_SIGNATURE" } as object };
      throw err;
    }
    if (!event) return { status: 200 as const, body: { result: "IGNORED" } as object };
    return { status: 200 as const, body: (await applyTrackingEvent(db, { provider: deps.shipping.name, ...event })) as object };
  };

  app.post("/webhooks/shipping/:provider", async (c) => {
    if (c.req.param("provider") !== deps.shipping.name) return c.json({ error: "UNKNOWN_PROVIDER" }, 404);
    const r = await processTracking(c.req.raw);
    return c.json(r.body, r.status);
  });

  app.post("/webhooks/:provider", async (c) => {
    if (c.req.param("provider") !== payments.name) return c.json({ error: "UNKNOWN_PROVIDER" }, 404);
    const r = await processWebhook(c.req.raw);
    return c.json(r.body, r.status);
  });

  // -------------------------------------------------------------------------
  // Seller workspace
  // -------------------------------------------------------------------------

  app.route("/seller", sellerRoutes({ db, media: deps.media, shipping: deps.shipping }));
  app.route("/addresses", addressRoutes({ db }));

  // -------------------------------------------------------------------------
  // Jobs
  // -------------------------------------------------------------------------

  app.get("/cron/expire-holds", async (c) => {
    if (!deps.cronSecret || c.req.header("authorization") !== `Bearer ${deps.cronSecret}`) {
      return c.json({ error: "UNAUTHORIZED" }, 401);
    }
    return c.json(await expireHolds(db));
  });

  app.get("/cron/close-delivered", async (c) => {
    if (!deps.cronSecret || c.req.header("authorization") !== `Bearer ${deps.cronSecret}`) {
      return c.json({ error: "UNAUTHORIZED" }, 401);
    }
    return c.json(await closeDeliveredOrders(db));
  });

  // -------------------------------------------------------------------------
  // Development only
  // -------------------------------------------------------------------------

  if (deps.sandbox && deps.allowDevAuth) {
    const sandbox = deps.sandbox;

    app.post("/dev/login", async (c) => {
      const { userId } = await c.req.json<{ userId: string }>();
      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
      if (!user) return c.json({ error: "NOT_FOUND" }, 404);
      const previous = getCookie(c, SESSION_COOKIE);
      if (previous) await revokeSession(db, previous);
      const s = await createSession(db, { userId: user.id, userAgent: c.req.header("user-agent") });
      setSessionCookie(c, s.sessionToken, s.sessionExpiresAt, secureCookies);
      return c.json({ ok: true });
    });

    const devShipping = deps.shipping instanceof DevShippingProvider ? deps.shipping : null;
    if (devShipping) {
      /** Pretend to be the courier: send the next signed tracking scan through the real webhook path. */
      app.post("/dev/shipments/:awb/advance", async (c) => {
        const awb = c.req.param("awb");
        const outcome = (await c.req.json().catch(() => ({}))) as { status?: string };
        const [s] = await db.select({ status: shipments.status }).from(shipments).where(eq(shipments.awb, awb));
        if (!s) return c.json({ error: "NOT_FOUND" }, 404);
        const next = outcome.status === "RTO" ? "RTO" : NEXT_DEV_STATUS[s.status];
        if (!next) return c.json({ error: "NO_NEXT_STATUS", details: { status: s.status } }, 409);
        const r = await processTracking(devShipping.buildTrackingWebhook(awb, next));
        return c.json(r.body, r.status);
      });

      app.get("/dev/labels/:awb", async (c) => {
        const awb = c.req.param("awb");
        const [row] = await db
          .select({ order: orders, courier: shipments.courierName, seller: sellers.displayName, pickupPincode: sellers.pickupPincode })
          .from(shipments)
          .innerJoin(orders, eq(orders.id, shipments.orderId))
          .innerJoin(sellers, eq(sellers.id, orders.sellerId))
          .where(eq(shipments.awb, awb));
        if (!row?.order.shippingAddress) return c.text("Not found", 404);
        const a = row.order.shippingAddress;
        const esc = (v: string | null | undefined) => (v ?? "").replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
        return c.html(`<!doctype html><meta charset="utf-8"><title>Label ${esc(awb)}</title>
<body style="font-family:system-ui;max-width:420px;margin:24px auto;border:2px solid #000;padding:16px">
<p style="margin:0;font-size:12px">DEVELOPMENT LABEL — not valid for shipping</p>
<h1 style="font-family:monospace;letter-spacing:2px">${esc(awb)}</h1>
<p><b>${esc(row.courier)}</b> · Order ${esc(row.order.reference)}</p>
<h3>Deliver to</h3><p>${esc(a.name)}<br>${esc(a.line1)}${a.line2 ? `<br>${esc(a.line2)}` : ""}${a.landmark ? `<br>Near ${esc(a.landmark)}` : ""}<br>${esc(a.city)}, ${esc(a.state)} ${esc(a.pincode)}<br>${esc(a.phone)}</p>
<h3>From</h3><p>${esc(row.seller)} · ${esc(row.pickupPincode)}</p>
<p>Prepaid · no cash to collect</p><script>print()</script></body>`);
      });
    }

    /** Pretend to be the gateway: send a signed webhook for an attempt through the real webhook path. */
    app.post("/dev/sandbox/complete", async (c) => {
      const { providerOrderId, outcome } = await c.req.json<{ providerOrderId: string; outcome: "success" | "failure" }>();
      const [attempt] = await db
        .select()
        .from(paymentAttempts)
        .where(and(eq(paymentAttempts.provider, sandbox.name), eq(paymentAttempts.providerOrderId, providerOrderId)));
      if (!attempt) return c.json({ error: "NOT_FOUND" }, 404);
      const r = await processWebhook(
        sandbox.buildWebhook({
          type: outcome === "success" ? "payment.succeeded" : "payment.failed",
          providerOrderId,
          amountPaise: attempt.amountPaise,
          currency: attempt.currency,
        }),
      );
      return c.json(r.body, r.status);
    });
  }

  app.onError((err, c) => {
    if (err instanceof ShippingUnavailableError) return c.json({ error: "SHIPPING_UNAVAILABLE" }, 503);
    // Log the details server-side; never send stack traces to clients.
    console.error(err);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  });

  app.doc("/openapi.json", { openapi: "3.1.0", info: { title: "YOLT API", version: "0.1.0" } });

  return app;
}

export type App = ReturnType<typeof createApp>;
