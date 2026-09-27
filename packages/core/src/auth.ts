import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { normalizeIndianMobile } from "@yolt/shared";
import { otpChallenges, sessions, users, type Db, type FirstTouch } from "@yolt/db";

/**
 * Phone OTP login and database sessions (docs/decisions.md, "Auth").
 *
 * - OTPs: 6 digits, 5 minute expiry, 5 wrong attempts per code, 30 s resend cooldown,
 *   5 codes per phone per hour, 20 per network per hour. Only an HMAC of the code is stored.
 * - Sessions: random 32-byte tokens; only SHA-256(token) is stored. 30-day sliding expiry,
 *   revocable one at a time or all at once.
 */

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
export const OTP_MAX_PER_PHONE_PER_HOUR = 5;
export const OTP_MAX_PER_IP_PER_HOUR = 20;
export const SESSION_TTL_SECONDS = 30 * 86_400;
/** Only extend a session's expiry this often, to avoid a write on every request. */
const SESSION_TOUCH_SECONDS = 3600;

export type AuthSecrets = {
  /** Server-side secret mixed into OTP and IP hashes. Rotating it invalidates outstanding codes. */
  pepper: string;
};

const addSeconds = (d: Date, s: number) => new Date(d.getTime() + s * 1000);
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const hmac = (secret: string, v: string) => createHmac("sha256", secret).update(v).digest("hex");
export const hashIp = (secrets: AuthSecrets, ip: string | null | undefined) => (ip ? hmac(secrets.pepper, `ip:${ip}`) : null);
const hashCode = (secrets: AuthSecrets, phone: string, code: string) => hmac(secrets.pepper, `otp:${phone}:${code}`);

// ---------------------------------------------------------------------------
// Request a code
// ---------------------------------------------------------------------------

export type RequestOtpResult =
  | { ok: true; phone: string; code: string; channel: "WHATSAPP" | "SMS"; expiresAt: Date }
  | { ok: false; reason: "INVALID_PHONE" }
  | { ok: false; reason: "RESEND_COOLDOWN" | "TOO_MANY_REQUESTS"; retryAfterSeconds: number };

/**
 * Creates a challenge and returns the code for the caller to deliver. The code must never
 * be sent back to the client (except by the development-only sender).
 */
export async function requestOtp(
  db: Db,
  secrets: AuthSecrets,
  input: { phone: string; ip?: string | null; channel?: "WHATSAPP" | "SMS"; now?: Date },
): Promise<RequestOtpResult> {
  const now = input.now ?? new Date();
  const phone = normalizeIndianMobile(input.phone);
  if (!phone) return { ok: false, reason: "INVALID_PHONE" };
  const ipHash = hashIp(secrets, input.ip);
  const hourAgo = addSeconds(now, -3600);

  return db.transaction(async (tx) => {
    // Serialise requests for the same phone so cooldowns can't be raced.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`otp:${phone}`}))`);

    const [latest] = await tx
      .select({ createdAt: otpChallenges.createdAt })
      .from(otpChallenges)
      .where(eq(otpChallenges.phone, phone))
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);
    if (latest) {
      const wait = OTP_RESEND_COOLDOWN_SECONDS - Math.floor((now.getTime() - latest.createdAt.getTime()) / 1000);
      if (wait > 0) return { ok: false, reason: "RESEND_COOLDOWN", retryAfterSeconds: wait } as const;
    }

    const [{ n: perPhone }] = (await tx
      .select({ n: count() })
      .from(otpChallenges)
      .where(and(eq(otpChallenges.phone, phone), gt(otpChallenges.createdAt, hourAgo)))) as [{ n: number }];
    if (perPhone >= OTP_MAX_PER_PHONE_PER_HOUR) return { ok: false, reason: "TOO_MANY_REQUESTS", retryAfterSeconds: 3600 } as const;

    if (ipHash) {
      const [{ n: perIp }] = (await tx
        .select({ n: count() })
        .from(otpChallenges)
        .where(and(eq(otpChallenges.ipHash, ipHash), gt(otpChallenges.createdAt, hourAgo)))) as [{ n: number }];
      if (perIp >= OTP_MAX_PER_IP_PER_HOUR) return { ok: false, reason: "TOO_MANY_REQUESTS", retryAfterSeconds: 3600 } as const;
    }

    // Only the newest code is valid.
    await tx
      .update(otpChallenges)
      .set({ consumedAt: now })
      .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt)));

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const channel = input.channel ?? "WHATSAPP";
    const expiresAt = addSeconds(now, OTP_TTL_SECONDS);
    await tx.insert(otpChallenges).values({
      phone,
      codeHash: hashCode(secrets, phone, code),
      channel,
      ipHash,
      expiresAt,
      createdAt: now,
    });
    return { ok: true, phone, code, channel, expiresAt } as const;
  });
}

// ---------------------------------------------------------------------------
// Verify a code → user + session
// ---------------------------------------------------------------------------

export type VerifyOtpResult =
  | { ok: true; userId: string; isNewUser: boolean; sessionToken: string; sessionExpiresAt: Date }
  | { ok: false; reason: "INVALID_PHONE" | "EXPIRED" | "TOO_MANY_ATTEMPTS" }
  | { ok: false; reason: "WRONG_CODE"; attemptsLeft: number };

export async function verifyOtp(
  db: Db,
  secrets: AuthSecrets,
  input: { phone: string; code: string; firstTouch?: FirstTouch | null; userAgent?: string | null; now?: Date },
): Promise<VerifyOtpResult> {
  const now = input.now ?? new Date();
  const phone = normalizeIndianMobile(input.phone);
  if (!phone) return { ok: false, reason: "INVALID_PHONE" };
  const code = input.code.replace(/\s/g, "");

  const outcome = await db.transaction(async (tx) => {
    const [challenge] = await tx
      .select()
      .from(otpChallenges)
      .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt)))
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1)
      .for("update"); // two concurrent correct submissions can't both log in
    if (!challenge || challenge.expiresAt <= now) return { ok: false, reason: "EXPIRED" } as const;
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "TOO_MANY_ATTEMPTS" } as const;

    const expected = Buffer.from(challenge.codeHash, "hex");
    const actual = Buffer.from(hashCode(secrets, phone, code), "hex");
    if (!/^\d{6}$/.test(code) || !timingSafeEqual(expected, actual)) {
      const attempts = challenge.attempts + 1;
      await tx
        .update(otpChallenges)
        .set({ attempts, ...(attempts >= OTP_MAX_ATTEMPTS ? { consumedAt: now } : {}) })
        .where(eq(otpChallenges.id, challenge.id));
      return attempts >= OTP_MAX_ATTEMPTS
        ? ({ ok: false, reason: "TOO_MANY_ATTEMPTS" } as const)
        : ({ ok: false, reason: "WRONG_CODE", attemptsLeft: OTP_MAX_ATTEMPTS - attempts } as const);
    }

    await tx.update(otpChallenges).set({ consumedAt: now }).where(eq(otpChallenges.id, challenge.id));

    // Find or create the user for this phone. Accounts are linked only by a verified phone.
    const inserted = await tx
      .insert(users)
      .values({ phone, phoneVerifiedAt: now, firstTouch: input.firstTouch ?? null, createdAt: now })
      .onConflictDoNothing({ target: users.phone })
      .returning({ id: users.id });
    let userId: string;
    const isNewUser = inserted.length === 1;
    if (isNewUser) {
      userId = inserted[0]!.id;
    } else {
      const [existing] = await tx.select().from(users).where(eq(users.phone, phone));
      userId = existing!.id;
      await tx
        .update(users)
        .set({
          phoneVerifiedAt: existing!.phoneVerifiedAt ?? now,
          // First touch is set once and never overwritten (D16).
          ...(existing!.firstTouch === null && input.firstTouch ? { firstTouch: input.firstTouch } : {}),
        })
        .where(eq(users.id, userId));
    }

    const session = await insertSession(tx, { userId, userAgent: input.userAgent, now });
    return { ok: true, userId, isNewUser, ...session } as const;
  });
  return outcome;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

async function insertSession(
  tx: Pick<Db, "insert">,
  input: { userId: string; userAgent?: string | null; now: Date },
) {
  const sessionToken = randomBytes(32).toString("base64url");
  const sessionExpiresAt = addSeconds(input.now, SESSION_TTL_SECONDS);
  await tx.insert(sessions).values({
    userId: input.userId,
    tokenHash: sha256(sessionToken),
    userAgent: input.userAgent?.slice(0, 300) ?? null,
    createdAt: input.now,
    lastSeenAt: input.now,
    expiresAt: sessionExpiresAt,
  });
  return { sessionToken, sessionExpiresAt };
}

/** Creates a session directly. Used by the development-only login; real logins go through verifyOtp. */
export async function createSession(db: Db, input: { userId: string; userAgent?: string | null; now?: Date }) {
  return insertSession(db, { ...input, now: input.now ?? new Date() });
}

export type SessionUser = {
  userId: string;
  sessionId: string;
  /** When the user last proved control of their phone (sessions start at OTP verification). */
  sessionCreatedAt: Date;
  phone: string | null;
  name: string | null;
};

/** Resolves a session token. Slides the expiry forward at most once an hour. */
export async function getSessionUser(db: Db, token: string | null | undefined, now = new Date()): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select({ session: sessions, phone: users.phone, name: users.name })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, sha256(token)));
  if (!row || row.session.revokedAt || row.session.expiresAt <= now) return null;

  if (now.getTime() - row.session.lastSeenAt.getTime() > SESSION_TOUCH_SECONDS * 1000) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: addSeconds(now, SESSION_TTL_SECONDS) })
      .where(eq(sessions.id, row.session.id));
  }
  return {
    userId: row.session.userId,
    sessionId: row.session.id,
    sessionCreatedAt: row.session.createdAt,
    phone: row.phone,
    name: row.name,
  };
}

export async function revokeSession(db: Db, token: string, now = new Date()) {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt)));
}

/** "Log out of all devices". */
export async function revokeAllSessions(db: Db, userId: string, now = new Date()) {
  const r = await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return r.length;
}
