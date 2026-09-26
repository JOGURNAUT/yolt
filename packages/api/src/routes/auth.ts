import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { parseFirstTouch, requestOtp, revokeAllSessions, revokeSession, verifyOtp, type AuthSecrets } from "@yolt/core";
import type { Db } from "@yolt/db";
import { FIRST_TOUCH_COOKIE, formatIndianMobile } from "@yolt/shared";
import { clientIp, SESSION_COOKIE, type AuthVariables } from "../auth";
import { DevOtpSender, type OtpSender } from "../otp/sender";

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});
const Any = json(z.any(), "OK");

export function setSessionCookie(c: Context, token: string, expires: Date, secure: boolean) {
  setCookie(c, SESSION_COOKIE, token, { path: "/", httpOnly: true, sameSite: "Lax", secure, expires });
}

export function authRoutes(deps: {
  db: Db;
  secrets: AuthSecrets;
  otp: OtpSender;
  secureCookies: boolean;
  /** Development only: include the code in the response so the local login screen can show it. */
  exposeDevCodes: boolean;
}) {
  const { db, secrets, otp } = deps;
  const app = new OpenAPIHono<{ Variables: AuthVariables }>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: "INVALID_REQUEST", details: result.error.issues }, 400);
    },
  });

  app.openapi(
    createRoute({
      method: "post",
      path: "/otp",
      summary: "Send a login code by WhatsApp (or SMS)",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({ phone: z.string().min(10).max(20), channel: z.enum(["WHATSAPP", "SMS"]).optional() }),
            },
          },
        },
      },
      responses: { 200: Any, 400: Any, 429: Any, 503: Any },
    }),
    async (c) => {
      const { phone, channel } = c.req.valid("json");
      const r = await requestOtp(db, secrets, { phone, channel, ip: clientIp(c) });
      if (!r.ok) {
        if (r.reason === "INVALID_PHONE") return c.json({ error: r.reason }, 400);
        c.header("Retry-After", String(r.retryAfterSeconds));
        return c.json({ error: r.reason, details: { retryAfterSeconds: r.retryAfterSeconds } }, 429);
      }
      try {
        await otp.send({ phone: r.phone, code: r.code, channel: r.channel });
      } catch {
        return c.json({ error: "OTP_DELIVERY_FAILED" }, 503);
      }
      const devCode = deps.exposeDevCodes && otp instanceof DevOtpSender ? otp.latestCode(r.phone) : undefined;
      return c.json(
        { sentTo: formatIndianMobile(r.phone), channel: r.channel, expiresAt: r.expiresAt.toISOString(), ...(devCode ? { devCode } : {}) },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/verify",
      summary: "Check a login code; signs in, creating the account on first login",
      request: {
        body: {
          content: {
            "application/json": { schema: z.object({ phone: z.string().min(10).max(20), code: z.string().min(4).max(10) }) },
          },
        },
      },
      responses: { 200: Any, 400: Any, 401: Any, 429: Any },
    }),
    async (c) => {
      const { phone, code } = c.req.valid("json");
      const r = await verifyOtp(db, secrets, {
        phone,
        code,
        firstTouch: parseFirstTouch(getCookie(c, FIRST_TOUCH_COOKIE)),
        userAgent: c.req.header("user-agent"),
      });
      if (!r.ok) {
        if (r.reason === "INVALID_PHONE") return c.json({ error: r.reason }, 400);
        if (r.reason === "TOO_MANY_ATTEMPTS") return c.json({ error: r.reason }, 429);
        return c.json({ error: r.reason, details: "attemptsLeft" in r ? { attemptsLeft: r.attemptsLeft } : undefined }, 401);
      }
      // Replace any session this browser already had.
      const previous = getCookie(c, SESSION_COOKIE);
      if (previous) await revokeSession(db, previous);
      setSessionCookie(c, r.sessionToken, r.sessionExpiresAt, deps.secureCookies);
      return c.json({ userId: r.userId, isNewUser: r.isNewUser }, 200);
    },
  );

  app.openapi(
    createRoute({ method: "get", path: "/me", summary: "The signed-in user, or null", responses: { 200: Any } }),
    (c) => {
      const s = c.get("session");
      return c.json(s ? { userId: s.userId, phone: s.phone, name: s.name } : null, 200);
    },
  );

  app.openapi(
    createRoute({ method: "post", path: "/logout", summary: "Sign out of this device", responses: { 200: Any } }),
    async (c) => {
      const token = getCookie(c, SESSION_COOKIE);
      if (token) await revokeSession(db, token);
      deleteCookie(c, SESSION_COOKIE, { path: "/", secure: deps.secureCookies });
      return c.json({ ok: true }, 200);
    },
  );

  app.openapi(
    createRoute({ method: "post", path: "/logout-all", summary: "Sign out of every device", responses: { 200: Any, 401: Any } }),
    async (c) => {
      const s = c.get("session");
      if (!s) return c.json({ error: "SIGN_IN_REQUIRED" }, 401);
      const revoked = await revokeAllSessions(db, s.userId);
      deleteCookie(c, SESSION_COOKIE, { path: "/", secure: deps.secureCookies });
      return c.json({ ok: true, revoked }, 200);
    },
  );

  return app;
}
