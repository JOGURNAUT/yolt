import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  addToBag,
  bagListingIds,
  followSeller,
  getBag,
  mergeBag,
  mergeSaves,
  removeFromBag,
  saveListing,
  savedListingIds,
  unfollowSeller,
  unsaveListing,
} from "@yolt/core";
import type { Db } from "@yolt/db";
import type { AuthVariables } from "../auth";

type Env = { Variables: AuthVariables };
const Any = { content: { "application/json": { schema: z.any() } }, description: "OK" };
const Uuid = z.string().uuid();
const body = <T extends z.ZodType>(schema: T) => ({ body: { content: { "application/json": { schema } } } });
const param = (name: string) => z.object({ [name]: Uuid.openapi({ param: { name, in: "path" } }) });

/**
 * Each of these apps is mounted under its own prefix (/saves, /follows, /bag), so the
 * sign-in middleware below is scoped to it and can't leak onto other routes.
 */
function signedInApp() {
  const app = new OpenAPIHono<Env>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: "INVALID_REQUEST", details: result.error.issues }, 400);
    },
  });
  app.use("*", async (c, next) => {
    if (!c.get("session")) return c.json({ error: "SIGN_IN_REQUIRED" }, 401);
    await next();
  });
  return app;
}
const uid = (c: { get: (k: "session") => AuthVariables["session"] }) => c.get("session")!.userId;

export function saveRoutes(deps: { db: Db }) {
  const { db } = deps;
  const app = signedInApp();
  app.openapi(createRoute({ method: "get", path: "/", summary: "Saved listing ids", responses: { 200: Any } }), async (c) => c.json(await savedListingIds(db, uid(c)), 200));
  app.openapi(
    createRoute({ method: "post", path: "/", summary: "Save a listing", request: body(z.object({ listingId: Uuid })), responses: { 200: Any, 404: Any, 409: Any } }),
    async (c) => {
      const r = await saveListing(db, { userId: uid(c), listingId: c.req.valid("json").listingId });
      return r.ok ? c.json({ ok: true }, 200) : c.json({ error: r.reason }, r.reason === "NOT_FOUND" ? 404 : 409);
    },
  );
  app.openapi(
    createRoute({ method: "delete", path: "/{listingId}", summary: "Unsave", request: { params: param("listingId") }, responses: { 200: Any } }),
    async (c) => {
      await unsaveListing(db, { userId: uid(c), listingId: c.req.valid("param").listingId as string });
      return c.json({ ok: true }, 200);
    },
  );
  app.openapi(
    createRoute({ method: "post", path: "/merge", summary: "Fold a guest's device saves into the account", request: body(z.object({ listingIds: z.array(z.string().max(40)).max(200) })), responses: { 200: Any } }),
    async (c) => c.json(await mergeSaves(db, { userId: uid(c), listingIds: c.req.valid("json").listingIds }), 200),
  );
  return app;
}

export function followRoutes(deps: { db: Db }) {
  const { db } = deps;
  const app = signedInApp();
  app.openapi(
    createRoute({ method: "post", path: "/", summary: "Follow a store", request: body(z.object({ sellerId: Uuid })), responses: { 200: Any, 404: Any, 409: Any } }),
    async (c) => {
      const r = await followSeller(db, { userId: uid(c), sellerId: c.req.valid("json").sellerId });
      return r.ok ? c.json({ ok: true }, 200) : c.json({ error: r.reason }, r.reason === "NOT_FOUND" ? 404 : 409);
    },
  );
  app.openapi(
    createRoute({ method: "delete", path: "/{sellerId}", summary: "Unfollow", request: { params: param("sellerId") }, responses: { 200: Any } }),
    async (c) => {
      await unfollowSeller(db, { userId: uid(c), sellerId: c.req.valid("param").sellerId as string });
      return c.json({ ok: true }, 200);
    },
  );
  return app;
}

export function bagRoutes(deps: { db: Db }) {
  const { db } = deps;
  const app = signedInApp();
  app.openapi(createRoute({ method: "get", path: "/", summary: "The bag, grouped by store (nothing is reserved)", responses: { 200: Any } }), async (c) =>
    c.json(await getBag(db, uid(c)), 200),
  );
  app.openapi(createRoute({ method: "get", path: "/ids", summary: "Listing ids in the bag", responses: { 200: Any } }), async (c) => c.json(await bagListingIds(db, uid(c)), 200));
  app.openapi(
    createRoute({ method: "post", path: "/", summary: "Add to bag", request: body(z.object({ listingId: Uuid })), responses: { 200: Any, 404: Any, 409: Any } }),
    async (c) => {
      const r = await addToBag(db, { userId: uid(c), listingId: c.req.valid("json").listingId });
      return r.ok ? c.json({ ok: true }, 200) : c.json({ error: r.reason }, r.reason === "NOT_FOUND" ? 404 : 409);
    },
  );
  app.openapi(
    createRoute({ method: "delete", path: "/{listingId}", summary: "Remove from bag", request: { params: param("listingId") }, responses: { 200: Any } }),
    async (c) => {
      await removeFromBag(db, { userId: uid(c), listingIds: [c.req.valid("param").listingId as string] });
      return c.json({ ok: true }, 200);
    },
  );
  app.openapi(
    createRoute({ method: "post", path: "/merge", summary: "Fold a guest's device bag into the account", request: body(z.object({ listingIds: z.array(z.string().max(40)).max(200) })), responses: { 200: Any } }),
    async (c) => c.json(await mergeBag(db, { userId: uid(c), listingIds: c.req.valid("json").listingIds }), 200),
  );
  return app;
}
