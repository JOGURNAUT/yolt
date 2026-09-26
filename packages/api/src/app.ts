import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, asc, eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import {
  createCheckout,
  createSession,
  expireHolds,
  handlePaymentEvent,
  parseFirstTouch,
  releaseCheckout,
  revokeSession,
  startPayment,
  type AuthSecrets,
} from "@yolt/core";
import { holds, orderItems, orders, paymentAttempts, users, type Db } from "@yolt/db";
import { FIRST_TOUCH_COOKIE } from "@yolt/shared";
import { SESSION_COOKIE, sameOriginMiddleware, sessionMiddleware, type AuthVariables } from "./auth";
import type { OtpSender } from "./otp/sender";
import { authRoutes, setSessionCookie } from "./routes/auth";
import { WebhookVerificationError, type PaymentProvider } from "./payments/provider";
import type { MediaStorage } from "./media/storage";
import type { SandboxPaymentProvider } from "./payments/sandbox";
import { sellerRoutes } from "./routes/seller";

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

  app.post("/webhooks/:provider", async (c) => {
    if (c.req.param("provider") !== payments.name) return c.json({ error: "UNKNOWN_PROVIDER" }, 404);
    const r = await processWebhook(c.req.raw);
    return c.json(r.body, r.status);
  });

  // -------------------------------------------------------------------------
  // Seller workspace
  // -------------------------------------------------------------------------

  app.route("/seller", sellerRoutes({ db, media: deps.media }));

  // -------------------------------------------------------------------------
  // Jobs
  // -------------------------------------------------------------------------

  app.get("/cron/expire-holds", async (c) => {
    if (!deps.cronSecret || c.req.header("authorization") !== `Bearer ${deps.cronSecret}`) {
      return c.json({ error: "UNAUTHORIZED" }, 401);
    }
    return c.json(await expireHolds(db));
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

  app.doc("/openapi.json", { openapi: "3.1.0", info: { title: "YOLT API", version: "0.1.0" } });

  return app;
}

export type App = ReturnType<typeof createApp>;
