import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { orders, users } from "@yolt/db";
import { FIRST_TOUCH_COOKIE, SESSION_COOKIE, UnconfiguredOtpSender } from "../src";
import { createListing, createSeller, testDb, truncateAll } from "../../core/test/fixtures";
import { makeApp } from "./helpers";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));

const { app } = makeApp(db);
const PHONE = "98765 43210";

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

/** Extracts "name=value" from a Set-Cookie header for reuse as a Cookie header. */
const cookieFrom = (res: Response, name: string) =>
  res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(";")[0];

async function login(extraCookie?: string) {
  const sent = await post("/api/auth/otp", { phone: PHONE });
  const { devCode } = (await sent.json()) as { devCode: string };
  const res = await post("/api/auth/verify", { phone: PHONE, code: devCode }, extraCookie ? { cookie: extraCookie } : {});
  return { res, cookie: cookieFrom(res, SESSION_COOKIE)! };
}

describe("phone login over HTTP", () => {
  it("send code → verify → session cookie → /me", async () => {
    const sent = await post("/api/auth/otp", { phone: PHONE });
    expect(sent.status).toBe(200);
    const body = (await sent.json()) as { devCode: string };
    expect(body).toMatchObject({ sentTo: "+91 98765 43210", channel: "WHATSAPP", devCode: expect.stringMatching(/^\d{6}$/) });

    const res = await post("/api/auth/verify", { phone: PHONE, code: body.devCode });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ isNewUser: true });
    const cookie = cookieFrom(res, SESSION_COOKIE)!;
    const me = await app.request("/api/auth/me", { headers: { cookie } });
    expect(await me.json()).toMatchObject({ phone: "+919876543210" });
  });

  it("sets an HttpOnly, SameSite=Lax cookie, Secure outside dev", async () => {
    const { res } = await login();
    const raw = res.headers.getSetCookie().find((c) => c.startsWith(SESSION_COOKIE))!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);

    const { app: prodLike } = makeApp(db, { allowDevAuth: false, secureCookies: true });
    // Codes are never returned without dev mode, so read one via the dev app, then verify on the prod-like app.
    await truncateAll(db);
    const sent = await post("/api/auth/otp", { phone: PHONE });
    const { devCode } = (await sent.json()) as { devCode: string };
    const verified = await prodLike.request("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: PHONE, code: devCode }),
    });
    expect(verified.headers.getSetCookie().find((c) => c.startsWith(SESSION_COOKIE))).toMatch(/Secure/i);
  });

  it("never returns the code when dev mode is off", async () => {
    const { app: prod } = makeApp(db, { allowDevAuth: false, sandbox: undefined });
    const res = await prod.request("/api/auth/otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: PHONE }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty("devCode");
  });

  it("wrong code → 401 with attempts left; resend too soon → 429 with Retry-After", async () => {
    await post("/api/auth/otp", { phone: PHONE });
    const wrong = await post("/api/auth/verify", { phone: PHONE, code: "000000" });
    const body = (await wrong.json()) as { error: string; details?: { attemptsLeft: number } };
    if (body.error === "WRONG_CODE") expect(body.details?.attemptsLeft).toBe(4);
    else expect(wrong.status).toBe(200); // the code really was 000000

    const again = await post("/api/auth/otp", { phone: PHONE });
    expect(again.status).toBe(429);
    expect(Number(again.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("reports delivery failure instead of pretending a code was sent", async () => {
    const { app: noSender } = makeApp(db, { otp: new UnconfiguredOtpSender() });
    const res = await noSender.request("/api/auth/otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: PHONE }),
    });
    expect(res.status).toBe(503);
  });

  it("logout revokes the session server-side", async () => {
    const { cookie } = await login();
    await app.request("/api/auth/logout", { method: "POST", headers: { cookie } });
    expect(await (await app.request("/api/auth/me", { headers: { cookie } })).json()).toBeNull();
  });

  it("rejects state-changing requests from another site", async () => {
    const res = await post("/api/auth/otp", { phone: PHONE }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    const same = await post("/api/auth/otp", { phone: PHONE }, { origin: "http://localhost" });
    expect(same.status).toBe(200);
  });

  it("the old dev user-id cookie no longer authenticates anything", async () => {
    const { seller, owner } = await createSeller(db);
    await createListing(db, seller.id);
    const res = await app.request("/api/seller/listings", { headers: { cookie: `yolt_dev_user=${owner.id}` } });
    expect(res.status).toBe(401);
  });
});

describe("attribution from the first-touch cookie (D16)", () => {
  it("a buyer who arrived via the store's link is recorded as SELLER_LINK", async () => {
    const { seller } = await createSeller(db, { handle: "secondloop" });
    const l = await createListing(db, seller.id);
    const ft = `${FIRST_TOUCH_COOKIE}=${encodeURIComponent(JSON.stringify({ type: "SELLER_LINK", sellerHandle: "secondloop", at: new Date().toISOString() }))}`;

    const { cookie } = await login(ft);
    const [u] = await db.select().from(users).where(eq(users.phone, "+919876543210"));
    expect(u!.firstTouch).toMatchObject({ type: "SELLER_LINK" });

    const res = await post("/api/checkout", { listingIds: [l.id] }, { cookie });
    const { orderId } = (await res.json()) as { orderId: string };
    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o!.source).toBe("SELLER_LINK");
  });

  it("everyone else is YOLT_DISCOVERY", async () => {
    const { seller } = await createSeller(db, { handle: "secondloop" });
    const l = await createListing(db, seller.id);
    const { cookie } = await login();
    const res = await post("/api/checkout", { listingIds: [l.id] }, { cookie });
    const { orderId } = (await res.json()) as { orderId: string };
    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o!.source).toBe("YOLT_DISCOVERY");
  });
});
