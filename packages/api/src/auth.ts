import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { getSessionUser, type SessionUser } from "@yolt/core";
import type { Db } from "@yolt/db";

export const SESSION_COOKIE = "yolt_session";
export { FIRST_TOUCH_COOKIE } from "@yolt/shared";

export type AuthVariables = { session: SessionUser | null };

/** Resolves the session cookie once per request; handlers read `c.get("session")`. */
export function sessionMiddleware(db: Db): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    c.set("session", await getSessionUser(db, getCookie(c, SESSION_COOKIE)));
    await next();
  };
}

/**
 * CSRF defence in depth (cookies are already SameSite=Lax): a state-changing request that
 * carries an Origin header must come from this site. Server-to-server calls (webhooks,
 * cron) send no Origin and are authenticated by signature or secret instead.
 */
export function sameOriginMiddleware(allowedOrigins: string[]): MiddlewareHandler {
  return async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && !["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      const self = new URL(c.req.url).origin;
      if (origin !== self && !allowedOrigins.includes(origin)) return c.json({ error: "CROSS_SITE_REQUEST" }, 403);
    }
    await next();
  };
}

export function clientIp(c: Context): string | null {
  // Vercel and most proxies put the client first in X-Forwarded-For.
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || null;
}
