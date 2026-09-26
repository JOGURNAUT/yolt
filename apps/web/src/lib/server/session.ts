import "server-only";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { DEV_USER_COOKIE } from "@yolt/api";
import { sellers } from "@yolt/db";
import { db } from "./db";

/**
 * TEMPORARY: mirrors the API's dev cookie auth for server components until real
 * OTP sessions exist. Always null in production.
 */
export async function getCurrentUserId(): Promise<string | null> {
  if (process.env.NODE_ENV === "production") return null;
  const id = (await cookies()).get(DEV_USER_COOKIE)?.value;
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export async function getCurrentSeller() {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const [seller] = await db
    .select()
    .from(sellers)
    .where(and(eq(sellers.userId, userId), eq(sellers.status, "APPROVED")));
  return seller ? { seller, userId } : null;
}
