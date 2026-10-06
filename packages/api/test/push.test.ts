import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSession, queueDropReminders, scheduleDrop, createDrop, addListingToDrop, setDropReminder } from "@yolt/core";
import { listingPhotos, pushSubscriptions } from "@yolt/db";
import { FakePushSender, SESSION_COOKIE, UnconfiguredPushSender } from "../src";
import { createListing, createSeller, createUser, testDb, truncateAll } from "../../core/test/fixtures";
import { makeApp } from "./helpers";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));
const push = new FakePushSender();
const { app } = makeApp(db, { push });

const KEY = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
const AUTH = "tBHItJI5svbpez7KI4CCXg";
const sub = (endpoint = "https://push.test/send/1") => ({ endpoint, keys: { p256dh: KEY, auth: AUTH } });

async function login(userId: string) {
  const s = await createSession(db, { userId });
  return `${SESSION_COOKIE}=${s.sessionToken}`;
}
const call = (method: string, path: string, cookie: string | null, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(`/api/push${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("config", () => {
  it("is public and returns the VAPID public key", async () => {
    const res = await call("GET", "/config", null);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: true, publicKey: push.publicKey });
  });

  it("says enabled: false while push is not configured", async () => {
    const { app: off } = makeApp(db, { push: new UnconfiguredPushSender() });
    expect(await (await off.request("/api/push/config")).json()).toEqual({ enabled: false });
  });
});

describe("subscribe and unsubscribe", () => {
  it("need a session", async () => {
    expect((await call("POST", "/subscribe", null, sub())).status).toBe(401);
    expect((await call("POST", "/unsubscribe", null, { endpoint: sub().endpoint })).status).toBe(401);
  });

  it("reject cross-site requests", async () => {
    const u = await createUser(db);
    const cookie = await login(u.id);
    expect((await call("POST", "/subscribe", cookie, sub(), { origin: "https://evil.example" })).status).toBe(403);
    expect((await call("POST", "/unsubscribe", cookie, { endpoint: sub().endpoint }, { origin: "https://evil.example" })).status).toBe(403);
    expect(await db.select().from(pushSubscriptions)).toHaveLength(0);
  });

  it("save the subscription for the session user, idempotently", async () => {
    const u = await createUser(db);
    const cookie = await login(u.id);
    const first = await call("POST", "/subscribe", cookie, sub(), { "user-agent": "Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36" });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, created: true });
    expect(await (await call("POST", "/subscribe", cookie, sub())).json()).toEqual({ ok: true, created: false });
    const rows = await db.select().from(pushSubscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: u.id, endpoint: sub().endpoint, p256dh: KEY, auth: AUTH });
    expect(rows[0]!.userAgent).toMatch(/Chrome/);
  });

  it("validate the body", async () => {
    const u = await createUser(db);
    const cookie = await login(u.id);
    expect((await call("POST", "/subscribe", cookie, {})).status).toBe(400);
    expect((await call("POST", "/subscribe", cookie, { endpoint: "https://push.test/x" })).status).toBe(400);
    expect((await call("POST", "/subscribe", cookie, { ...sub(), userId: u.id })).status).toBe(400);
    expect((await call("POST", "/subscribe", cookie, sub("http://push.test/insecure"))).status).toBe(400);
    expect((await call("POST", "/subscribe", cookie, { endpoint: sub().endpoint, keys: { p256dh: "bad key!", auth: AUTH } })).status).toBe(400);
    expect((await call("POST", "/unsubscribe", cookie, {})).status).toBe(400);
    expect(await db.select().from(pushSubscriptions)).toHaveLength(0);
  });

  it("refuse to subscribe while push is not configured", async () => {
    const { app: off } = makeApp(db, { push: new UnconfiguredPushSender() });
    const u = await createUser(db);
    const res = await off.request("/api/push/subscribe", { method: "POST", headers: { cookie: await login(u.id), "content-type": "application/json" }, body: JSON.stringify(sub()) });
    expect(res.status).toBe(503);
  });

  it("unsubscribe only revokes the caller's own subscription", async () => {
    const [a, b] = [await createUser(db), await createUser(db)];
    const [ca, cb] = [await login(a.id), await login(b.id)];
    await call("POST", "/subscribe", ca, sub());
    expect((await call("POST", "/unsubscribe", cb, { endpoint: sub().endpoint })).status).toBe(200);
    expect((await db.select().from(pushSubscriptions))[0]!.revokedAt).toBeNull();
    expect((await call("POST", "/unsubscribe", ca, { endpoint: sub().endpoint })).status).toBe(200);
    expect((await db.select().from(pushSubscriptions))[0]!.revokedAt).not.toBeNull();
    expect((await call("POST", "/unsubscribe", ca, { endpoint: sub().endpoint })).status).toBe(200);
  });

  it("are rate limited per user", async () => {
    const u = await createUser(db);
    const cookie = await login(u.id);
    let last = 200;
    for (let i = 0; i < 31; i++) last = (await call("POST", "/subscribe", cookie, sub(`https://push.test/send/${i % 3}`))).status;
    expect(last).toBe(429);
    const blocked = await call("POST", "/unsubscribe", cookie, { endpoint: sub().endpoint });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ error: "RATE_LIMITED", details: { retryAfterSeconds: expect.any(Number) } });
    // Another user is unaffected.
    const other = await createUser(db);
    expect((await call("POST", "/subscribe", await login(other.id), sub("https://push.test/other"))).status).toBe(200);
  });
});

describe("notifications cron", () => {
  it("needs the cron secret", async () => {
    expect((await app.request("/api/cron/notifications")).status).toBe(401);
    expect((await app.request("/api/cron/notifications", { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
    const { app: noSecret } = makeApp(db, { cronSecret: undefined });
    expect((await noSecret.request("/api/cron/notifications", { headers: { authorization: "Bearer undefined" } })).status).toBe(401);
  });

  it("delivers a drop reminder to the subscribed user through the fake sender, once", async () => {
    const t0 = new Date();
    const { seller, owner } = await createSeller(db);
    const item = await createListing(db, seller.id, { status: "DRAFT", publishedAt: null });
    await db.insert(listingPhotos).values((["FRONT", "BACK", "LABEL", "FLAW"] as const).map((kind, position) => ({ listingId: item.id, kind, position, url: `https://media.test/${kind}.webp` })));
    const startsAt = new Date(t0.getTime() + 30 * 60_000);
    const d = await createDrop(db, { sellerId: seller.id, title: "Winter Vintage Drop", startsAt, maxHoldsPerBuyer: 2, now: t0 });
    if (!d.ok) throw new Error(d.reason);
    await addListingToDrop(db, { sellerId: seller.id, dropId: d.dropId, listingId: item.id });
    await scheduleDrop(db, { sellerId: seller.id, dropId: d.dropId, actorUserId: owner.id, now: t0 });
    const buyer = await createUser(db);
    await setDropReminder(db, { userId: buyer.id, dropId: d.dropId, on: true });
    await call("POST", "/subscribe", await login(buyer.id), sub());
    await queueDropReminders(db, { now: new Date(startsAt.getTime() - 10 * 60_000) });

    const headers = { authorization: "Bearer cron" };
    const first = await (await app.request("/api/cron/notifications", { headers })).json();
    expect(first).toMatchObject({ enabled: true, sent: 1 });
    expect((await app.request("/api/cron/notifications", { headers })).status).toBe(200);
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]!.message).toMatchObject({ body: "Winter Vintage Drop", url: `/d/${d.dropId}` });
  });
});
