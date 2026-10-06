import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { admins, sessions } from "@yolt/db";
import {
  createSession,
  deviceLabel,
  getAccount,
  getSessionUser,
  listSessions,
  revokeOtherSessions,
  revokeSessionById,
  updateAccountName,
} from "../src";
import { createSeller, createUser, testDb, truncateAll } from "./fixtures";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));

const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const EDGE_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";

describe("account", () => {
  it("reads name, phone and the seller and admin flags", async () => {
    const u = await createUser(db, "Ananya");
    expect(await getAccount(db, u.id)).toMatchObject({ name: "Ananya", phone: u.phone, isSeller: false, sellerStatus: null, isAdmin: false, adminRole: null });

    const { owner } = await createSeller(db);
    await db.insert(admins).values({ userId: owner.id, role: "SUPPORT", grantedBy: "test" });
    expect(await getAccount(db, owner.id)).toMatchObject({ isSeller: true, sellerStatus: "APPROVED", isAdmin: true, adminRole: "SUPPORT" });

    const { owner: pending } = await createSeller(db, { status: "APPLIED" });
    expect(await getAccount(db, pending.id)).toMatchObject({ isSeller: false, sellerStatus: "APPLIED" });
    expect(await getAccount(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("renames, trimming and collapsing spaces, within 2 to 60 characters", async () => {
    const u = await createUser(db);
    expect(await updateAccountName(db, { userId: u.id, name: "  Ananya   Sharma " })).toEqual({ ok: true, name: "Ananya Sharma" });
    expect((await getAccount(db, u.id))!.name).toBe("Ananya Sharma");
    expect(await updateAccountName(db, { userId: u.id, name: "A" })).toEqual({ ok: false, reason: "INVALID" });
    expect(await updateAccountName(db, { userId: u.id, name: "x".repeat(61) })).toEqual({ ok: false, reason: "INVALID" });
  });
});

describe("device labels", () => {
  it.each([
    [CHROME_ANDROID, "Chrome on Android"],
    [SAFARI_IPHONE, "Safari on iOS"],
    [EDGE_WINDOWS, "Edge on Windows"],
    ["curl/8.0", "Unknown device"],
    [null, "Unknown device"],
  ])("%s", (ua, label) => expect(deviceLabel(ua)).toBe(label));
});

describe("sessions", () => {
  async function devices() {
    const u = await createUser(db);
    const other = await createUser(db);
    const mk = (userId: string, userAgent: string, minutesAgo: number) =>
      createSession(db, { userId, userAgent, now: new Date(Date.now() - minutesAgo * 60_000) });
    const phone = await mk(u.id, CHROME_ANDROID, 30);
    const laptop = await mk(u.id, EDGE_WINDOWS, 10);
    const theirs = await mk(other.id, SAFARI_IPHONE, 5);
    const resolve = async (t: string) => (await getSessionUser(db, t))!;
    return { u, other, phone: await resolve(phone.sessionToken), laptop: await resolve(laptop.sessionToken), theirs: await resolve(theirs.sessionToken), tokens: { phone, laptop } };
  }

  it("lists my active sessions with device labels, flags the current one and exposes no secrets", async () => {
    const d = await devices();
    const list = await listSessions(db, { userId: d.u.id, currentSessionId: d.laptop.sessionId });
    expect(list.map((s) => [s.deviceLabel, s.current])).toEqual([
      ["Edge on Windows", true],
      ["Chrome on Android", false],
    ]);
    expect(Object.keys(list[0]!).sort()).toEqual(["createdAt", "current", "deviceLabel", "id", "lastSeenAt"]);
    const json = JSON.stringify(list);
    expect(json).not.toContain(d.tokens.phone.sessionToken);
    expect(json).not.toContain("token");
  });

  it("hides revoked and expired sessions", async () => {
    const d = await devices();
    await revokeSessionById(db, { userId: d.u.id, sessionId: d.phone.sessionId, currentSessionId: d.laptop.sessionId });
    expect(await listSessions(db, { userId: d.u.id, currentSessionId: d.laptop.sessionId })).toHaveLength(1);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, d.laptop.sessionId));
    expect(await listSessions(db, { userId: d.u.id, currentSessionId: d.laptop.sessionId })).toHaveLength(0);
  });

  it("revoking another device signs only that one out", async () => {
    const d = await devices();
    const r = await revokeSessionById(db, { userId: d.u.id, sessionId: d.phone.sessionId, currentSessionId: d.laptop.sessionId });
    expect(r).toEqual({ ok: true, wasCurrent: false });
    expect(await getSessionUser(db, d.tokens.phone.sessionToken)).toBeNull();
    expect(await getSessionUser(db, d.tokens.laptop.sessionToken)).not.toBeNull();
  });

  it("revoking the current session reports it, and signs it out", async () => {
    const d = await devices();
    const r = await revokeSessionById(db, { userId: d.u.id, sessionId: d.laptop.sessionId, currentSessionId: d.laptop.sessionId });
    expect(r).toEqual({ ok: true, wasCurrent: true });
    expect(await getSessionUser(db, d.tokens.laptop.sessionToken)).toBeNull();
  });

  it("can't revoke someone else's session, or one twice", async () => {
    const d = await devices();
    expect(await revokeSessionById(db, { userId: d.u.id, sessionId: d.theirs.sessionId, currentSessionId: d.laptop.sessionId })).toEqual({ ok: false, reason: "NOT_FOUND" });
    const [row] = await db.select().from(sessions).where(and(eq(sessions.id, d.theirs.sessionId)));
    expect(row!.revokedAt).toBeNull();
    await revokeSessionById(db, { userId: d.u.id, sessionId: d.phone.sessionId, currentSessionId: d.laptop.sessionId });
    expect(await revokeSessionById(db, { userId: d.u.id, sessionId: d.phone.sessionId, currentSessionId: d.laptop.sessionId })).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("revoke others keeps the current session and leaves other users alone", async () => {
    const d = await devices();
    expect(await revokeOtherSessions(db, { userId: d.u.id, currentSessionId: d.laptop.sessionId })).toBe(1);
    expect(await getSessionUser(db, d.tokens.laptop.sessionToken)).not.toBeNull();
    expect(await getSessionUser(db, d.tokens.phone.sessionToken)).toBeNull();
    expect(await listSessions(db, { userId: d.other.id, currentSessionId: d.theirs.sessionId })).toHaveLength(1);
    expect(await revokeOtherSessions(db, { userId: d.u.id, currentSessionId: d.laptop.sessionId })).toBe(0);
  });
});
