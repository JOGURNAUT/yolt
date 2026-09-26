import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { createAddress, deleteAddress, listAddresses, setDefaultAddress, updateAddress } from "@yolt/core";
import type { Db } from "@yolt/db";
import type { AuthVariables } from "../auth";

const Any = { content: { "application/json": { schema: z.any() } }, description: "OK" };
const IdParam = z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) });
const AddressBody = z.object({
  name: z.string().max(100),
  phone: z.string().max(20),
  line1: z.string().max(250),
  line2: z.string().max(250).nullable().optional(),
  landmark: z.string().max(150).nullable().optional(),
  city: z.string().max(100),
  state: z.string().max(60),
  pincode: z.string().max(10),
  makeDefault: z.boolean().optional(),
});

/** The signed-in buyer's address book. */
export function addressRoutes(deps: { db: Db }) {
  const { db } = deps;
  const app = new OpenAPIHono<{ Variables: AuthVariables }>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: "INVALID_REQUEST", details: result.error.issues }, 400);
    },
  });

  app.use("*", async (c, next) => {
    if (!c.get("session")) return c.json({ error: "SIGN_IN_REQUIRED" }, 401);
    await next();
  });
  const userId = (c: { get: (k: "session") => AuthVariables["session"] }) => c.get("session")!.userId;

  app.openapi(createRoute({ method: "get", path: "/", summary: "Saved addresses, default first", responses: { 200: Any } }), async (c) =>
    c.json(await listAddresses(db, userId(c)), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      summary: "Add an address",
      request: { body: { content: { "application/json": { schema: AddressBody } } } },
      responses: { 201: Any, 400: Any, 409: Any },
    }),
    async (c) => {
      const { makeDefault, ...address } = c.req.valid("json");
      const r = await createAddress(db, { userId: userId(c), address, makeDefault });
      if (r.ok) return c.json(r.address, 201);
      if (r.reason === "INVALID") return c.json({ error: r.reason, details: { errors: r.errors } }, 400);
      return c.json({ error: r.reason }, 409);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/{id}",
      summary: "Edit an address (placed orders keep their own copy)",
      request: { params: IdParam, body: { content: { "application/json": { schema: AddressBody.omit({ makeDefault: true }) } } } },
      responses: { 200: Any, 400: Any, 404: Any },
    }),
    async (c) => {
      const r = await updateAddress(db, { userId: userId(c), addressId: c.req.valid("param").id, address: c.req.valid("json") });
      if (r.ok) return c.json(r.address, 200);
      if (r.reason === "INVALID") return c.json({ error: r.reason, details: { errors: r.errors } }, 400);
      return c.json({ error: r.reason }, 404);
    },
  );

  app.openapi(
    createRoute({ method: "post", path: "/{id}/default", summary: "Make this the default address", request: { params: IdParam }, responses: { 200: Any, 404: Any } }),
    async (c) => {
      const r = await setDefaultAddress(db, { userId: userId(c), addressId: c.req.valid("param").id });
      return r.ok ? c.json({ ok: true }, 200) : c.json({ error: r.reason }, 404);
    },
  );

  app.openapi(
    createRoute({ method: "delete", path: "/{id}", summary: "Delete an address", request: { params: IdParam }, responses: { 200: Any, 404: Any } }),
    async (c) => {
      const r = await deleteAddress(db, { userId: userId(c), addressId: c.req.valid("param").id });
      return r.ok ? c.json({ ok: true }, 200) : c.json({ error: r.reason }, 404);
    },
  );

  return app;
}
