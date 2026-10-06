import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { hitRateLimit, rateLimitKey, subscribePush, unsubscribePush, type AuthSecrets, type PushSender } from "@yolt/core";
import type { Db } from "@yolt/db";
import type { AuthVariables } from "../auth";
import { Err, SIGN_IN_REQUIRED, body, json } from "./schemas";

/** Enough for a person tidying devices; far below anything a script could abuse. */
const CHANGES_PER_HOUR = 30;

const Endpoint = z.string().max(2000).openapi({ example: "https://fcm.googleapis.com/fcm/send/abc" });

/**
 * Web push for the signed-in user, mounted at /push. The config route is public so the page
 * can decide whether to offer notifications at all; changing subscriptions needs a session and
 * only ever touches the session user's own rows.
 */
export function pushRoutes(deps: { db: Db; push: PushSender; secrets: AuthSecrets }) {
  const { db, push } = deps;
  const app = new OpenAPIHono<{ Variables: AuthVariables }>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: "INVALID_REQUEST", details: result.error.issues }, 400);
    },
  });

  app.openapi(
    createRoute({
      method: "get",
      path: "/config",
      summary: "The public VAPID key browsers subscribe with, or { enabled: false } while push is off",
      responses: { 200: json(z.union([z.object({ enabled: z.literal(true), publicKey: z.string() }), z.object({ enabled: z.literal(false) })]), "Push configuration") },
    }),
    (c) => {
      c.header("Cache-Control", "no-store");
      return push.enabled && push.publicKey ? c.json({ enabled: true as const, publicKey: push.publicKey }, 200) : c.json({ enabled: false as const }, 200);
    },
  );

  const limited = async (userId: string) =>
    hitRateLimit(db, { key: rateLimitKey(deps.secrets, "push-sub", userId), limit: CHANGES_PER_HOUR, windowSeconds: 3600 });

  app.openapi(
    createRoute({
      method: "post",
      path: "/subscribe",
      summary: "Save this browser's push subscription (the shape of PushSubscription.toJSON())",
      request: body(z.object({ endpoint: Endpoint, keys: z.object({ p256dh: z.string().max(256), auth: z.string().max(256) }) }).strict()),
      responses: {
        200: json(z.object({ ok: z.literal(true), created: z.boolean() }), "Subscribed (repeating it is harmless)"),
        400: Err("Invalid subscription"),
        401: Err("Sign in required"),
        429: Err("Too many changes; see retryAfterSeconds"),
        503: Err("Push is not configured on this deployment"),
      },
    }),
    async (c) => {
      const session = c.get("session");
      if (!session) return c.json(SIGN_IN_REQUIRED, 401);
      if (!push.enabled) return c.json({ error: "PUSH_NOT_CONFIGURED" }, 503);
      const limit = await limited(session.userId);
      if (!limit.ok) return c.json({ error: "RATE_LIMITED", details: { retryAfterSeconds: limit.retryAfterSeconds } }, 429);
      const b = c.req.valid("json");
      const r = await subscribePush(db, { userId: session.userId, endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth, userAgent: c.req.header("user-agent") });
      return r.ok ? c.json({ ok: true as const, created: r.created }, 200) : c.json({ error: r.reason }, 400);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/unsubscribe",
      summary: "Stop pushes to this browser",
      request: body(z.object({ endpoint: Endpoint }).strict()),
      responses: {
        200: json(z.object({ ok: z.literal(true) }), "Unsubscribed (also when it was already off)"),
        400: Err("Invalid request"),
        401: Err("Sign in required"),
        429: Err("Too many changes; see retryAfterSeconds"),
      },
    }),
    async (c) => {
      const session = c.get("session");
      if (!session) return c.json(SIGN_IN_REQUIRED, 401);
      const limit = await limited(session.userId);
      if (!limit.ok) return c.json({ error: "RATE_LIMITED", details: { retryAfterSeconds: limit.retryAfterSeconds } }, 429);
      await unsubscribePush(db, { userId: session.userId, endpoint: c.req.valid("json").endpoint });
      return c.json({ ok: true as const }, 200);
    },
  );

  return app;
}
