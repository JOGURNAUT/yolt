import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { deleteCookie } from "hono/cookie";
import { BUYER_STYLES, MAX_PREFERENCE_SIZES } from "@yolt/shared";
import {
  getAccount,
  getInYourSizes,
  getPreferences,
  listSessions,
  revokeOtherSessions,
  revokeSessionById,
  setPreferences,
  updateAccountName,
} from "@yolt/core";
import type { Db } from "@yolt/db";
import { SESSION_COOKIE, type AuthVariables } from "../auth";
import { Cards, Err, IdParam, Ok, SIGN_IN_REQUIRED, body, json } from "./schemas";

const AccountSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  isSeller: z.boolean(),
  sellerStatus: z.enum(["APPLIED", "APPROVED", "REJECTED", "SUSPENDED"]).nullable(),
  isAdmin: z.boolean(),
  adminRole: z.enum(["ADMIN", "SUPPORT"]).nullable(),
});

const PreferencesSchema = z.object({
  sizes: z.array(z.string()),
  styles: z.array(z.enum(BUYER_STYLES)),
  maxBudgetPaise: z.number().int().nullable(),
});

const SessionSchema = z.object({
  id: z.string().uuid(),
  deviceLabel: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  current: z.boolean(),
});

/**
 * The signed-in user's own account, mounted at /me (the prefix scopes the sign-in check).
 * Everything here acts on the session's user; no route takes a user id.
 */
export function meRoutes(deps: { db: Db; secureCookies: boolean }) {
  const { db } = deps;
  const app = new OpenAPIHono<{ Variables: AuthVariables }>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: "INVALID_REQUEST", details: result.error.issues }, 400);
    },
  });
  app.use("*", async (c, next) => {
    if (!c.get("session")) return c.json(SIGN_IN_REQUIRED, 401);
    await next();
  });
  const session = (c: { get: (k: "session") => AuthVariables["session"] }) => c.get("session")!;

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      summary: "The signed-in account: name, phone, seller and admin flags",
      responses: { 200: json(AccountSchema, "Account"), 401: Err("Sign in required"), 404: Err("Account not found") },
    }),
    async (c) => {
      const a = await getAccount(db, session(c).userId);
      return a ? c.json(a, 200) : c.json({ error: "NOT_FOUND" }, 404);
    },
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/",
      summary: "Change your name",
      request: body(z.object({ name: z.string().max(200) }).strict()),
      responses: { 200: json(z.object({ name: z.string() }), "Saved"), 400: Err("Name must be 2 to 60 characters"), 401: Err("Sign in required"), 404: Err("Account not found") },
    }),
    async (c) => {
      const r = await updateAccountName(db, { userId: session(c).userId, name: c.req.valid("json").name });
      if (r.ok) return c.json({ name: r.name }, 200);
      return r.reason === "INVALID" ? c.json({ error: r.reason }, 400) : c.json({ error: r.reason }, 404);
    },
  );

  // ---- Preferences -------------------------------------------------------------------------

  app.openapi(
    createRoute({
      method: "get",
      path: "/preferences",
      summary: "Your saved sizes, styles and budget (all optional)",
      responses: { 200: json(PreferencesSchema.extend({ isSet: z.boolean() }), "Preferences"), 401: Err("Sign in required") },
    }),
    async (c) => c.json(await getPreferences(db, session(c).userId), 200),
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/preferences",
      summary: "Replace your preferences. Send empty lists and null to clear them.",
      request: body(
        z
          .object({
            sizes: z.array(z.string().max(60)).max(MAX_PREFERENCE_SIZES * 2),
            styles: z.array(z.string().max(60)).max(BUYER_STYLES.length * 2),
            maxBudgetPaise: z.number().int().nullable(),
          })
          .strict(),
      ),
      responses: { 200: json(PreferencesSchema, "Saved"), 400: Err("Invalid preferences"), 401: Err("Sign in required") },
    }),
    async (c) => {
      const r = await setPreferences(db, { userId: session(c).userId, ...c.req.valid("json") });
      if (r.ok) return c.json(r.preferences, 200);
      return c.json({ error: r.reason, details: { field: r.field } }, 400);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/in-your-sizes",
      summary: "In-stock pieces in your sizes, newest first (empty until you set sizes)",
      responses: { 200: json(z.object({ sizes: z.array(z.string()), items: Cards }), "Matching pieces"), 401: Err("Sign in required") },
    }),
    async (c) => c.json(await getInYourSizes(db, session(c).userId), 200),
  );

  // ---- Devices -----------------------------------------------------------------------------

  app.openapi(
    createRoute({
      method: "get",
      path: "/sessions",
      summary: "Devices you're signed in on",
      responses: { 200: json(z.array(SessionSchema), "Active sessions, most recently used first"), 401: Err("Sign in required") },
    }),
    async (c) => {
      const s = session(c);
      const list = await listSessions(db, { userId: s.userId, currentSessionId: s.sessionId });
      return c.json(list.map((x) => ({ ...x, createdAt: x.createdAt.toISOString(), lastSeenAt: x.lastSeenAt.toISOString() })), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/sessions/revoke-others",
      summary: "Sign out of every device except this one",
      responses: { 200: json(z.object({ ok: z.literal(true), revoked: z.number().int() }), "Done"), 401: Err("Sign in required") },
    }),
    async (c) => {
      const s = session(c);
      return c.json({ ok: true as const, revoked: await revokeOtherSessions(db, { userId: s.userId, currentSessionId: s.sessionId }) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/sessions/{id}",
      summary: "Sign out one device. Revoking this device signs you out here too.",
      request: { params: IdParam },
      responses: {
        200: json(Ok.extend({ signedOut: z.boolean() }), "Revoked; signedOut is true when it was this device"),
        401: Err("Sign in required"),
        404: Err("No such session for this account"),
      },
    }),
    async (c) => {
      const s = session(c);
      const r = await revokeSessionById(db, { userId: s.userId, sessionId: c.req.valid("param").id, currentSessionId: s.sessionId });
      if (!r.ok) return c.json({ error: r.reason }, 404);
      if (r.wasCurrent) deleteCookie(c, SESSION_COOKIE, { path: "/", secure: deps.secureCookies });
      return c.json({ ok: true as const, signedOut: r.wasCurrent }, 200);
    },
  );

  return app;
}
