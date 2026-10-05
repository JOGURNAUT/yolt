import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  addListingToDrop,
  cancelDrop,
  createDrop,
  getDropLiveState,
  getDropView,
  getSellerDrop,
  listPublicDrops,
  listSellerDrops,
  removeListingFromDrop,
  scheduleDrop,
  setDropReminder,
} from "@yolt/core";
import type { Db, sellers } from "@yolt/db";
import type { AuthVariables } from "../auth";

const Any = { content: { "application/json": { schema: z.any() } }, description: "OK" };
const IdParam = z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) });

/** Mounted at /drops. Mostly public; the reminder route checks sign-in itself (no catch-all middleware). */
export function dropRoutes(deps: { db: Db }) {
  const { db } = deps;
  const app = new OpenAPIHono<{ Variables: AuthVariables }>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: "INVALID_REQUEST", details: result.error.issues }, 400);
    },
  });

  app.openapi(createRoute({ method: "get", path: "/", summary: "Upcoming and live drops", responses: { 200: Any } }), async (c) => c.json(await listPublicDrops(db), 200));

  app.openapi(
    createRoute({ method: "get", path: "/{id}", summary: "A drop with its items (opens it if due)", request: { params: IdParam }, responses: { 200: Any, 404: Any } }),
    async (c) => {
      const v = await getDropView(db, c.req.valid("param").id);
      return v ? c.json({ ...v, serverNow: new Date().toISOString() }, 200) : c.json({ error: "NOT_FOUND" }, 404);
    },
  );

  app.openapi(
    createRoute({ method: "get", path: "/{id}/live", summary: "Item statuses for the live page to poll", request: { params: IdParam }, responses: { 200: Any, 404: Any } }),
    async (c) => {
      const s = await getDropLiveState(db, c.req.valid("param").id);
      c.header("Cache-Control", "no-store");
      return s ? c.json(s, 200) : c.json({ error: "NOT_FOUND" }, 404);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/{id}/reminder",
      summary: "Turn “Remind me” on or off",
      request: { params: IdParam, body: { content: { "application/json": { schema: z.object({ on: z.boolean() }) } } } },
      responses: { 200: Any, 401: Any, 404: Any },
    }),
    async (c) => {
      const session = c.get("session");
      if (!session) return c.json({ error: "SIGN_IN_REQUIRED" }, 401);
      const r = await setDropReminder(db, { userId: session.userId, dropId: c.req.valid("param").id, on: c.req.valid("json").on });
      return r.ok ? c.json({ ok: true }, 200) : c.json({ error: r.reason }, 404);
    },
  );

  return app;
}

type SellerEnv = { Variables: AuthVariables & { seller: typeof sellers.$inferSelect; userId: string } };

/** Mounted under /seller (seller resolved in middleware). */
export function sellerDropRoutes(deps: { db: Db }) {
  const { db } = deps;
  const app = new OpenAPIHono<SellerEnv>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: "INVALID_REQUEST", details: result.error.issues }, 400);
    },
  });
  const sellerId = (c: { get: (k: "seller") => SellerEnv["Variables"]["seller"] }) => c.get("seller").id;
  const status = (reason: string) => (reason === "NOT_FOUND" ? 404 : reason === "SELLER_NOT_VERIFIED" ? 403 : 409);

  app.openapi(createRoute({ method: "get", path: "/drops", summary: "Your drops", responses: { 200: Any } }), async (c) => c.json(await listSellerDrops(db, sellerId(c)), 200));

  app.openapi(
    createRoute({
      method: "post",
      path: "/drops",
      summary: "Start a drop (draft)",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({ title: z.string().max(100), startsAt: z.string().datetime({ offset: true }), maxHoldsPerBuyer: z.union([z.literal(1), z.literal(2)]) }),
            },
          },
        },
      },
      responses: { 201: Any, 400: Any },
    }),
    async (c) => {
      const b = c.req.valid("json");
      const r = await createDrop(db, { sellerId: sellerId(c), title: b.title, startsAt: new Date(b.startsAt), maxHoldsPerBuyer: b.maxHoldsPerBuyer });
      return r.ok ? c.json(r, 201) : c.json({ error: r.reason }, 400);
    },
  );

  app.openapi(
    createRoute({ method: "get", path: "/drops/{id}", summary: "Your drop, its items, and listings that can join", request: { params: IdParam }, responses: { 200: Any, 404: Any } }),
    async (c) => {
      const r = await getSellerDrop(db, { sellerId: sellerId(c), dropId: c.req.valid("param").id });
      return r ? c.json(r, 200) : c.json({ error: "NOT_FOUND" }, 404);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/drops/{id}/items",
      summary: "Add a listing to a draft drop",
      request: { params: IdParam, body: { content: { "application/json": { schema: z.object({ listingId: z.string().uuid() }) } } } },
      responses: { 200: Any, 403: Any, 404: Any, 409: Any },
    }),
    async (c) => {
      const r = await addListingToDrop(db, { sellerId: sellerId(c), dropId: c.req.valid("param").id, listingId: c.req.valid("json").listingId });
      return r.ok ? c.json(r, 200) : c.json({ error: r.reason, details: "missing" in r ? { missing: r.missing } : undefined }, status(r.reason));
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/drops/{id}/items/{listingId}",
      summary: "Remove a listing from a draft drop",
      request: { params: IdParam.extend({ listingId: z.string().uuid().openapi({ param: { name: "listingId", in: "path" } }) }) },
      responses: { 200: Any, 403: Any, 404: Any, 409: Any },
    }),
    async (c) => {
      const { id, listingId } = c.req.valid("param");
      const r = await removeListingFromDrop(db, { sellerId: sellerId(c), dropId: id, listingId });
      return r.ok ? c.json(r, 200) : c.json({ error: r.reason }, status(r.reason));
    },
  );

  app.openapi(
    createRoute({ method: "post", path: "/drops/{id}/schedule", summary: "Lock the drop and its items until it opens", request: { params: IdParam }, responses: { 200: Any, 403: Any, 404: Any, 409: Any } }),
    async (c) => {
      const r = await scheduleDrop(db, { sellerId: sellerId(c), dropId: c.req.valid("param").id, actorUserId: c.get("userId") });
      return r.ok ? c.json(r, 200) : c.json({ error: r.reason, details: "listingIds" in r ? { listingIds: r.listingIds } : undefined }, status(r.reason));
    },
  );

  app.openapi(
    createRoute({ method: "post", path: "/drops/{id}/cancel", summary: "Cancel before it opens", request: { params: IdParam }, responses: { 200: Any, 403: Any, 404: Any, 409: Any } }),
    async (c) => {
      const r = await cancelDrop(db, { sellerId: sellerId(c), dropId: c.req.valid("param").id, actorUserId: c.get("userId") });
      return r.ok ? c.json(r, 200) : c.json({ error: r.reason }, status(r.reason));
    },
  );

  return app;
}
