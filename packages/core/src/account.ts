import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { admins, sellers, sessions, users, type Db } from "@yolt/db";

/**
 * The signed-in user's account: profile, and the devices they are signed in on. Session rows
 * hold only a SHA-256 of the cookie token; the ids shown to clients are the rows' own random ids,
 * which can't be used to sign in.
 */

export const NAME_LENGTH = { min: 2, max: 60 } as const;

export async function getAccount(db: Db, userId: string) {
  const [row] = await db
    .select({ id: users.id, name: users.name, phone: users.phone, sellerStatus: sellers.status, adminRole: admins.role })
    .from(users)
    .leftJoin(sellers, eq(sellers.userId, users.id))
    .leftJoin(admins, eq(admins.userId, users.id))
    .where(eq(users.id, userId));
  if (!row) return null;
  return {
    userId: row.id,
    name: row.name,
    phone: row.phone,
    isSeller: row.sellerStatus === "APPROVED",
    /** The application stage, for the profile menu ("Application under review"). Null if never a seller. */
    sellerStatus: row.sellerStatus,
    isAdmin: row.adminRole !== null,
    adminRole: row.adminRole,
  };
}

export async function updateAccountName(
  db: Db,
  input: { userId: string; name: string },
): Promise<{ ok: true; name: string } | { ok: false; reason: "INVALID" | "NOT_FOUND" }> {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (name.length < NAME_LENGTH.min || name.length > NAME_LENGTH.max) return { ok: false, reason: "INVALID" };
  const r = await db.update(users).set({ name }).where(eq(users.id, input.userId)).returning({ id: users.id });
  return r.length ? { ok: true, name } : { ok: false, reason: "NOT_FOUND" };
}

/** "Chrome on Android" from a User-Agent string. A label for people, not a fingerprint. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (!ua) return "Unknown device";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : null;
  // Order matters: Edge and Opera also say Chrome; Chrome also says Safari.
  const browser = /Edg(e|A|iOS)?\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Chrome|CriOS/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}

export type SessionView = { id: string; deviceLabel: string; createdAt: Date; lastSeenAt: Date; current: boolean };

/** Active (not revoked, not expired) sessions, most recently used first. */
export async function listSessions(db: Db, input: { userId: string; currentSessionId: string; now?: Date }): Promise<SessionView[]> {
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, input.userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, input.now ?? new Date())))
    .orderBy(desc(sessions.lastSeenAt));
  return rows.map((s) => ({
    id: s.id,
    deviceLabel: deviceLabel(s.userAgent),
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeenAt,
    current: s.id === input.currentSessionId,
  }));
}

/** Signs out one device. Scoped to the user, so another account's session id is simply not found. */
export async function revokeSessionById(
  db: Db,
  input: { userId: string; sessionId: string; currentSessionId: string; now?: Date },
): Promise<{ ok: true; wasCurrent: boolean } | { ok: false; reason: "NOT_FOUND" }> {
  const r = await db
    .update(sessions)
    .set({ revokedAt: input.now ?? new Date() })
    .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, input.userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return r.length ? { ok: true, wasCurrent: input.sessionId === input.currentSessionId } : { ok: false, reason: "NOT_FOUND" };
}

/** "Sign out of all other devices": everything except the session making the request. */
export async function revokeOtherSessions(db: Db, input: { userId: string; currentSessionId: string; now?: Date }) {
  const r = await db
    .update(sessions)
    .set({ revokedAt: input.now ?? new Date() })
    .where(and(eq(sessions.userId, input.userId), ne(sessions.id, input.currentSessionId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return r.length;
}
