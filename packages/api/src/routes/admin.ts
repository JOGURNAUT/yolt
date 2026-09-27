import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  adminSessionFresh,
  decideClaim,
  getAdminCounts,
  getAdminRole,
  listAuditEvents,
  listClaimsForAdmin,
  listExceptions,
  listRefundsForAdmin,
  listSellersForAdmin,
  markRefundSucceeded,
  onboardSeller,
  updateSellerStatus,
  type AdminRole,
} from "@yolt/core";
import type { Db } from "@yolt/db";
import type { AuthVariables } from "../auth";

type Env = { Variables: AuthVariables & { adminRole: AdminRole } };
const Any = { content: { "application/json": { schema: z.any() } }, description: "OK" };
const IdParam = z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) });
const json = <T extends z.ZodType>(schema: T) => ({ body: { content: { "application/json": { schema } } } });

/**
 * YOLT staff API, mounted at /admin (the prefix scopes the middleware below).
 * Requires: signed in → listed in `admins` → session from the last 12 h. SUPPORT is read-only.
 */
export function adminRoutes(deps: { db: Db }) {
  const { db } = deps;
  const app = new OpenAPIHono<Env>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: "INVALID_REQUEST", details: result.error.issues }, 400);
    },
  });

  app.use("*", async (c, next) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "SIGN_IN_REQUIRED" }, 401);
    const role = await getAdminRole(db, session.userId);
    // 404, not 403: don't confirm to non-staff that admin routes exist.
    if (!role) return c.json({ error: "NOT_FOUND" }, 404);
    if (!adminSessionFresh(session.sessionCreatedAt)) return c.json({ error: "REAUTH_REQUIRED" }, 401);
    if (c.req.method !== "GET" && role !== "ADMIN") return c.json({ error: "READ_ONLY_ROLE" }, 403);
    c.set("adminRole", role);
    await next();
  });
  const adminId = (c: { get: (k: "session") => AuthVariables["session"] }) => c.get("session")!.userId;

  app.openapi(createRoute({ method: "get", path: "/me", summary: "Staff role", responses: { 200: Any } }), (c) => c.json({ role: c.get("adminRole") }, 200));
  app.openapi(createRoute({ method: "get", path: "/counts", summary: "Dashboard counts", responses: { 200: Any } }), async (c) => c.json(await getAdminCounts(db), 200));

  app.openapi(
    createRoute({
      method: "get",
      path: "/claims",
      summary: "Claims by status",
      request: { query: z.object({ status: z.enum(["ESCALATED", "OPEN", "RESOLVED"]).default("ESCALATED") }) },
      responses: { 200: Any },
    }),
    async (c) => c.json(await listClaimsForAdmin(db, { status: c.req.valid("query").status }), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/claims/{id}/decide",
      summary: "Refund or reject a claim, with a reason",
      request: { params: IdParam, ...json(z.object({ decision: z.enum(["REFUND", "REJECT"]), reason: z.string().max(1000) })) },
      responses: { 200: Any, 400: Any, 404: Any, 409: Any },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const r = await decideClaim(db, { adminUserId: adminId(c), claimId: c.req.valid("param").id, ...body });
      if (r.ok) return c.json(r, 200);
      return c.json({ error: r.reason }, r.reason === "NOT_FOUND" ? 404 : r.reason === "REASON_REQUIRED" ? 400 : 409);
    },
  );

  app.openapi(createRoute({ method: "get", path: "/sellers", summary: "All stores", responses: { 200: Any } }), async (c) => c.json(await listSellersForAdmin(db), 200));

  app.openapi(
    createRoute({
      method: "post",
      path: "/sellers",
      summary: "Onboard an invited store (KYC starts pending)",
      request: json(
        z.object({
          phone: z.string().max(20),
          handle: z.string().max(40),
          displayName: z.string().max(80),
          instagramHandle: z.string().max(60).nullable().optional(),
          pickupPincode: z.string().max(10),
          pickupState: z.string().max(60),
        }),
      ),
      responses: { 201: Any, 400: Any, 409: Any },
    }),
    async (c) => {
      const r = await onboardSeller(db, { adminUserId: adminId(c), ...c.req.valid("json") });
      if (r.ok) return c.json(r, 201);
      if (r.reason === "INVALID") return c.json({ error: r.reason, details: { field: r.field } }, 400);
      return c.json({ error: r.reason }, 409);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/sellers/{id}/status",
      summary: "Verify KYC, suspend or reinstate, with a reason",
      request: { params: IdParam, ...json(z.object({ action: z.enum(["VERIFY_KYC", "SUSPEND", "REINSTATE"]), reason: z.string().max(1000) })) },
      responses: { 200: Any, 400: Any, 404: Any, 409: Any },
    }),
    async (c) => {
      const r = await updateSellerStatus(db, { adminUserId: adminId(c), sellerId: c.req.valid("param").id, ...c.req.valid("json") });
      if (r.ok) return c.json(r, 200);
      return c.json({ error: r.reason }, r.reason === "NOT_FOUND" ? 404 : r.reason === "REASON_REQUIRED" ? 400 : 409);
    },
  );

  app.openapi(
    createRoute({ method: "get", path: "/refunds", summary: "Refund queue", request: { query: z.object({ open: z.enum(["1", "0"]).default("1") }) }, responses: { 200: Any } }),
    async (c) => c.json(await listRefundsForAdmin(db, { open: c.req.valid("query").open === "1" }), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/refunds/{id}/succeeded",
      summary: "Record the provider's refund id after refunding in the provider dashboard",
      request: { params: IdParam, ...json(z.object({ providerRefundId: z.string().max(100) })) },
      responses: { 200: Any, 400: Any, 404: Any },
    }),
    async (c) => {
      const r = await markRefundSucceeded(db, { adminUserId: adminId(c), refundId: c.req.valid("param").id, providerRefundId: c.req.valid("json").providerRefundId });
      if (r.ok) return c.json(r, 200);
      return c.json({ error: r.reason }, r.reason === "NOT_FOUND" ? 404 : 400);
    },
  );

  app.openapi(createRoute({ method: "get", path: "/exceptions", summary: "Late payments and parcels returning to sellers", responses: { 200: Any } }), async (c) =>
    c.json(await listExceptions(db), 200),
  );
  app.openapi(createRoute({ method: "get", path: "/audit", summary: "Recent audit log", responses: { 200: Any } }), async (c) => c.json(await listAuditEvents(db), 200));

  return app;
}
