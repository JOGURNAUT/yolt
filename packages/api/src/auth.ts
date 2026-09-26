import type { Context } from "hono";
import { getCookie } from "hono/cookie";

export const DEV_USER_COOKIE = "yolt_dev_user";

export type Session = { userId: string };

/**
 * TEMPORARY: development-only identity from a cookie, until Better Auth + WhatsApp/SMS OTP
 * is wired in (docs/decisions.md). Refuses to work when `allowDevAuth` is false, which
 * createApp forces in production, so this can never authenticate a real request.
 */
export function getSession(c: Context, allowDevAuth: boolean): Session | null {
  if (!allowDevAuth) return null;
  const userId = getCookie(c, DEV_USER_COOKIE);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return userId && uuid.test(userId) ? { userId } : null;
}
