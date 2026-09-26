import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orders, otpChallenges, sessions, users } from "@yolt/db";
import {
  createCheckout,
  getSessionUser,
  orderSourceFor,
  parseFirstTouch,
  requestOtp,
  revokeAllSessions,
  revokeSession,
  verifyOtp,
  OTP_MAX_ATTEMPTS,
  type AuthSecrets,
} from "../src";
import { createListing, createSeller, testDb, truncateAll } from "./fixtures";

const { db, close } = testDb(20);
afterAll(close);
beforeEach(() => truncateAll(db));

const secrets: AuthSecrets = { pepper: "test-pepper" };
const PHONE = "98765 43210";
const at = (t0: Date, seconds: number) => new Date(t0.getTime() + seconds * 1000);

async function codeFor(phone = PHONE, now = new Date(), ip = "1.2.3.4") {
  const r = await requestOtp(db, secrets, { phone, ip, now });
  if (!r.ok) throw new Error(r.reason);
  return r;
}

describe("requesting codes", () => {
  it("normalises the phone, stores only a hash, and returns a 6-digit code", async () => {
    const r = await codeFor();
    expect(r.phone).toBe("+919876543210");
    expect(r.code).toMatch(/^\d{6}$/);
    const [row] = await db.select().from(otpChallenges);
    expect(row!.codeHash).not.toContain(r.code);
    expect(row!.ipHash).not.toContain("1.2.3.4");
  });

  it("rejects numbers that aren't Indian mobiles", async () => {
    expect(await requestOtp(db, secrets, { phone: "12345" })).toEqual({ ok: false, reason: "INVALID_PHONE" });
  });

  it("enforces a resend cooldown, then a per-phone hourly cap", async () => {
    const t0 = new Date();
    await codeFor(PHONE, t0);
    expect(await requestOtp(db, secrets, { phone: PHONE, now: at(t0, 10) })).toMatchObject({ ok: false, reason: "RESEND_COOLDOWN" });
    for (let i = 1; i < 5; i++) await codeFor(PHONE, at(t0, i * 31));
    expect(await requestOtp(db, secrets, { phone: PHONE, now: at(t0, 6 * 31) })).toMatchObject({ ok: false, reason: "TOO_MANY_REQUESTS" });
    expect((await requestOtp(db, secrets, { phone: PHONE, now: at(t0, 3700) })).ok).toBe(true);
  });

  it("caps codes per network across different phones", async () => {
    const t0 = new Date();
    for (let i = 0; i < 20; i++) await codeFor(`98000000${String(i).padStart(2, "0")}`, t0, "9.9.9.9");
    expect(await requestOtp(db, secrets, { phone: "9811111111", ip: "9.9.9.9", now: t0 })).toMatchObject({
      ok: false,
      reason: "TOO_MANY_REQUESTS",
    });
    expect((await requestOtp(db, secrets, { phone: "9811111111", ip: "8.8.8.8", now: t0 })).ok).toBe(true);
  });

  it("concurrent requests for one phone produce exactly one code", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => requestOtp(db, secrets, { phone: PHONE })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});

describe("verifying codes", () => {
  it("a correct code creates the user and a session", async () => {
    const { code } = await codeFor();
    const r = await verifyOtp(db, secrets, { phone: "+91 98765 43210", code });
    expect(r).toMatchObject({ ok: true, isNewUser: true });
    const [u] = await db.select().from(users);
    expect(u!.phone).toBe("+919876543210");
    expect(u!.phoneVerifiedAt).not.toBeNull();
  });

  it("the same phone logs into the same account", async () => {
    const first = await verifyOtp(db, secrets, { phone: PHONE, code: (await codeFor(PHONE, new Date(Date.now() - 60_000))).code });
    const second = await verifyOtp(db, secrets, { phone: PHONE, code: (await codeFor()).code });
    expect(first.ok && second.ok && first.userId === second.userId).toBe(true);
    expect(second.ok && second.isNewUser).toBe(false);
  });

  it("wrong codes count down, then lock the code", async () => {
    const { code } = await codeFor();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let left = OTP_MAX_ATTEMPTS - 1; left > 0; left--) {
      expect(await verifyOtp(db, secrets, { phone: PHONE, code: wrong })).toEqual({ ok: false, reason: "WRONG_CODE", attemptsLeft: left });
    }
    expect(await verifyOtp(db, secrets, { phone: PHONE, code: wrong })).toEqual({ ok: false, reason: "TOO_MANY_ATTEMPTS" });
    // Even the right code is dead now.
    expect((await verifyOtp(db, secrets, { phone: PHONE, code })).ok).toBe(false);
  });

  it("codes expire and are single-use", async () => {
    const t0 = new Date();
    const { code } = await codeFor(PHONE, t0);
    expect(await verifyOtp(db, secrets, { phone: PHONE, code, now: at(t0, 301) })).toEqual({ ok: false, reason: "EXPIRED" });

    const fresh = await codeFor(PHONE, at(t0, 400));
    expect((await verifyOtp(db, secrets, { phone: PHONE, code: fresh.code, now: at(t0, 401) })).ok).toBe(true);
    expect((await verifyOtp(db, secrets, { phone: PHONE, code: fresh.code, now: at(t0, 402) })).ok).toBe(false);
  });

  it("requesting a new code invalidates the previous one", async () => {
    const t0 = new Date();
    const old = await codeFor(PHONE, t0);
    const current = await codeFor(PHONE, at(t0, 31));
    if (old.code !== current.code) {
      expect((await verifyOtp(db, secrets, { phone: PHONE, code: old.code, now: at(t0, 32) })).ok).toBe(false);
    }
    expect((await verifyOtp(db, secrets, { phone: PHONE, code: current.code, now: at(t0, 33) })).ok).toBe(true);
  });

  it("two simultaneous correct submissions log in once", async () => {
    const { code } = await codeFor();
    const results = await Promise.all([verifyOtp(db, secrets, { phone: PHONE, code }), verifyOtp(db, secrets, { phone: PHONE, code })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.select().from(sessions)).toHaveLength(1);
  });

  it("a code for one phone can't log in another", async () => {
    const a = await codeFor("9876543210");
    const b = await codeFor("9123456789");
    if (a.code === b.code) return; // 1-in-a-million collision: nothing to test
    expect(await verifyOtp(db, secrets, { phone: "9123456789", code: a.code })).toMatchObject({ ok: false, reason: "WRONG_CODE" });
  });
});

describe("sessions", () => {
  async function login() {
    const r = await verifyOtp(db, secrets, { phone: PHONE, code: (await codeFor()).code, userAgent: "Test/1.0" });
    if (!r.ok) throw new Error(r.reason);
    return r;
  }

  it("stores only a hash of the token and resolves it back to the user", async () => {
    const r = await login();
    const [row] = await db.select().from(sessions);
    expect(row!.tokenHash).not.toBe(r.sessionToken);
    expect(await getSessionUser(db, r.sessionToken)).toMatchObject({ userId: r.userId, phone: "+919876543210" });
    expect(await getSessionUser(db, "forged-token")).toBeNull();
  });

  it("expires after 30 days of inactivity but slides while used", async () => {
    const r = await login();
    const t0 = new Date();
    expect(await getSessionUser(db, r.sessionToken, at(t0, 20 * 86_400))).not.toBeNull(); // slides expiry
    expect(await getSessionUser(db, r.sessionToken, at(t0, 45 * 86_400))).not.toBeNull();
    expect(await getSessionUser(db, r.sessionToken, at(t0, 90 * 86_400))).toBeNull();
  });

  it("logout revokes one session; log out everywhere revokes all", async () => {
    const a = await login();
    const b = await verifyOtp(db, secrets, { phone: PHONE, code: (await codeFor(PHONE, new Date(Date.now() + 40_000))).code, now: new Date(Date.now() + 41_000) });
    if (!b.ok) throw new Error();
    await revokeSession(db, a.sessionToken);
    expect(await getSessionUser(db, a.sessionToken)).toBeNull();
    expect(await getSessionUser(db, b.sessionToken)).not.toBeNull();
    expect(await revokeAllSessions(db, b.userId)).toBe(1);
    expect(await getSessionUser(db, b.sessionToken)).toBeNull();
  });
});

describe("order attribution (D16)", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const link = (handle: string, daysAgo: number) =>
    ({ type: "SELLER_LINK", sellerHandle: handle, at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString() }) as const;

  it("credits the seller only for their own link, within 30 days", () => {
    expect(orderSourceFor(link("secondloop", 3), "secondloop", now)).toBe("SELLER_LINK");
    expect(orderSourceFor(link("secondloop", 31), "secondloop", now)).toBe("YOLT_DISCOVERY");
    expect(orderSourceFor(link("otherstore", 3), "secondloop", now)).toBe("YOLT_DISCOVERY");
    expect(orderSourceFor({ type: "YOLT", at: now.toISOString() }, "secondloop", now)).toBe("YOLT_DISCOVERY");
    expect(orderSourceFor(null, "secondloop", now)).toBe("YOLT_DISCOVERY");
  });

  it("parses the cookie defensively", () => {
    expect(parseFirstTouch(JSON.stringify(link("secondloop", 1)))).toMatchObject({ type: "SELLER_LINK" });
    expect(parseFirstTouch("not json")).toBeNull();
    expect(parseFirstTouch(JSON.stringify({ type: "SELLER_LINK", sellerHandle: "<script>", at: now.toISOString() }))).toBeNull();
    expect(parseFirstTouch(JSON.stringify({ type: "YOLT", at: "yesterday" }))).toBeNull();
  });

  it("first touch is kept at signup and never overwritten; checkout records the source", async () => {
    const { seller } = await createSeller(db, { handle: "secondloop" });
    const l = await createListing(db, seller.id);
    const firstTouch = { type: "SELLER_LINK", sellerHandle: "secondloop", at: new Date().toISOString() } as const;
    const r = await verifyOtp(db, secrets, { phone: PHONE, code: (await codeFor()).code, firstTouch });
    if (!r.ok) throw new Error();
    const again = await verifyOtp(db, secrets, {
      phone: PHONE,
      code: (await codeFor(PHONE, new Date(Date.now() + 40_000))).code,
      firstTouch: { type: "YOLT", at: new Date().toISOString() },
      now: new Date(Date.now() + 41_000),
    });
    expect(again.ok).toBe(true);
    const [u] = await db.select().from(users).where(eq(users.id, r.userId));
    expect(u!.firstTouch).toMatchObject({ type: "SELLER_LINK", sellerHandle: "secondloop" });

    const c = await createCheckout(db, { buyerId: r.userId, listingIds: [l.id] });
    const [o] = await db.select().from(orders).where(eq(orders.id, c.ok ? c.orderId : ""));
    expect(o!.source).toBe("SELLER_LINK");
  });
});
