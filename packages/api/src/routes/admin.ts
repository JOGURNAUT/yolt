import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  adminSessionFresh,
  createSlot,
  deleteSlot,
  listApplications,
  listSlots,
  updateApplicationStatus,
  updateSlot,
  type SlotFailure,
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

  // ---- Homepage curation -------------------------------------------------------------------

  const SlotFields = {
    sellerId: z.string().uuid().nullable(),
    title: z.string().max(100).nullable(),
    listingIds: z.array(z.string().uuid()).max(50),
    startsAt: z.string().datetime({ offset: true }).nullable(),
    endsAt: z.string().datetime({ offset: true }).nullable(),
  };
  const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));
  const slotError = (r: SlotFailure) => {
    if (r.reason === "NOT_FOUND") return [{ error: r.reason }, 404] as const;
    if (r.reason === "INVALID") return [{ error: r.reason, details: { field: r.field } }, 400] as const;
    if (r.reason === "REASON_REQUIRED") return [{ error: r.reason }, 400] as const;
    if (r.reason === "LISTINGS_NOT_LIVE") return [{ error: r.reason, details: { listingIds: r.listingIds } }, 409] as const;
    return [{ error: r.reason }, 409] as const;
  };

  app.openapi(
    createRoute({ method: "get", path: "/homepage-slots", summary: "Curated homepage slots with their state (current, upcoming, expired) and which one is showing", responses: { 200: Any } }),
    async (c) => c.json(await listSlots(db), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/homepage-slots",
      summary: "Curate a featured store, Grails list or edit, with a reason",
      request: json(
        z.object({
          kind: z.enum(["FEATURED_STORE", "GRAILS", "EDIT"]),
          sellerId: SlotFields.sellerId.optional(),
          title: SlotFields.title.optional(),
          listingIds: SlotFields.listingIds.optional(),
          startsAt: SlotFields.startsAt.optional(),
          endsAt: SlotFields.endsAt.optional(),
          reason: z.string().max(1000),
        }),
      ),
      responses: { 201: Any, 400: Any, 404: Any, 409: Any },
    }),
    async (c) => {
      const b = c.req.valid("json");
      const r = await createSlot(db, {
        adminUserId: adminId(c),
        kind: b.kind,
        reason: b.reason,
        sellerId: b.sellerId,
        title: b.title,
        listingIds: b.listingIds,
        startsAt: toDate(b.startsAt),
        endsAt: toDate(b.endsAt),
      });
      if (r.ok) return c.json(r.slot, 201);
      const [body, status] = slotError(r);
      return c.json(body, status);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/homepage-slots/{id}",
      summary: "Change a slot's store, pieces, title or window, with a reason",
      request: {
        params: IdParam,
        ...json(
          z
            .object({
              sellerId: SlotFields.sellerId,
              title: SlotFields.title,
              listingIds: SlotFields.listingIds,
              startsAt: SlotFields.startsAt,
              endsAt: SlotFields.endsAt,
              reason: z.string().max(1000),
            })
            .partial({ sellerId: true, title: true, listingIds: true, startsAt: true, endsAt: true }),
        ),
      },
      responses: { 200: Any, 400: Any, 404: Any, 409: Any },
    }),
    async (c) => {
      const { reason, startsAt, endsAt, ...rest } = c.req.valid("json");
      const r = await updateSlot(db, {
        adminUserId: adminId(c),
        slotId: c.req.valid("param").id,
        reason,
        patch: { ...rest, startsAt: toDate(startsAt), endsAt: toDate(endsAt) },
      });
      if (r.ok) return c.json(r.slot, 200);
      const [body, status] = slotError(r);
      return c.json(body, status);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/homepage-slots/{id}",
      summary: "Remove a slot, with a reason",
      request: { params: IdParam, ...json(z.object({ reason: z.string().max(1000) })) },
      responses: { 200: Any, 400: Any, 404: Any },
    }),
    async (c) => {
      const r = await deleteSlot(db, { adminUserId: adminId(c), slotId: c.req.valid("param").id, reason: c.req.valid("json").reason });
      if (r.ok) return c.json(r, 200);
      return c.json({ error: r.reason }, r.reason === "NOT_FOUND" ? 404 : 400);
    },
  );

  // ---- Seller applications -----------------------------------------------------------------

  app.openapi(
    createRoute({
      method: "get",
      path: "/applications",
      summary: "Apply-to-sell queue, newest first, optionally filtered by status",
      request: { query: z.object({ status: z.enum(["NEW", "CONTACTED", "ONBOARDED", "REJECTED"]).optional() }) },
      responses: { 200: Any },
    }),
    async (c) => c.json(await listApplications(db, { status: c.req.valid("query").status }), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/applications/{id}/status",
      summary: "Move an application along, with a reason and an optional staff note",
      request: {
        params: IdParam,
        ...json(z.object({ status: z.enum(["NEW", "CONTACTED", "ONBOARDED", "REJECTED"]), note: z.string().max(2000).nullable().optional(), reason: z.string().max(1000) })),
      },
      responses: { 200: Any, 400: Any, 404: Any, 409: Any },
    }),
    async (c) => {
      const r = await updateApplicationStatus(db, { adminUserId: adminId(c), applicationId: c.req.valid("param").id, ...c.req.valid("json") });
      if (r.ok) return c.json(r.application, 200);
      return c.json({ error: r.reason }, r.reason === "NOT_FOUND" ? 404 : r.reason === "REASON_REQUIRED" || r.reason === "NOTE_TOO_LONG" ? 400 : 409);
    },
  );

  app.openapi(createRoute({ method: "get", path: "/exceptions", summary: "Late payments and parcels returning to sellers", responses: { 200: Any } }), async (c) =>
    c.json(await listExceptions(db), 200),
  );
  app.openapi(createRoute({ method: "get", path: "/audit", summary: "Recent audit log", responses: { 200: Any } }), async (c) => c.json(await listAuditEvents(db), 200));

  return app;
}
