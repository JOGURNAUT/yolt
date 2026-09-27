import "server-only";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE } from "@yolt/api";
import { adminSessionFresh, getAdminRole, getSessionUser } from "@yolt/core";
import { sellers } from "@yolt/db";
import { db } from "./db";

/** The signed-in user for server components, from the same session cookie the API uses. */
export async function getCurrentUser() {
  return getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
}

export async function getCurrentSeller() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [seller] = await db
    .select()
    .from(sellers)
    .where(and(eq(sellers.userId, user.userId), eq(sellers.status, "APPROVED")));
  return seller ? { seller, userId: user.userId } : null;
}

/**
 * For seller pages: sends signed-out visitors to login and signed-in non-sellers to /sell
 * (distinct targets, or login would bounce a signed-in buyer straight back here).
 */
export async function requireSeller(nextPath: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const current = await getCurrentSeller();
  if (!current) redirect("/sell");
  return current;
}

/**
 * For /admin pages. Non-staff get a 404 (admin pages don't reveal themselves). Staff whose
 * login is older than 12 hours get `stale: true` and must sign in again.
 */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) notFound();
  const role = await getAdminRole(db, user.userId);
  if (!role) notFound();
  return { user, role, stale: !adminSessionFresh(user.sessionCreatedAt) };
}
