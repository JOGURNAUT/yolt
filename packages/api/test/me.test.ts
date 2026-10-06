import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSession, getSessionUser } from "@yolt/core";
import { admins } from "@yolt/db";
import { SESSION_COOKIE } from "../src";
import { createListing, createSeller, createUser, testDb, truncateAll, TEST_ADDRESS } from "../../core/test/fixtures";
import { makeApp } from "./helpers";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));
const { app } = makeApp(db);

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

async function login(userId: string, userAgent = CHROME) {
  const s = await createSession(db, { userId, userAgent });
  return { cookie: `${SESSION_COOKIE}=${s.sessionToken}`, token: s.sessionToken };
}
const call = (method: string, path: string, cookie: string | null, body?: unknown) =>
  app.request(`/api/me${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("authentication", () => {
  it("every /me route needs a session", async () => {
    for (const [m, p] of [["GET", ""], ["PATCH", ""], ["GET", "/preferences"], ["PUT", "/preferences"], ["GET", "/in-your-sizes"], ["GET", "/sessions"], ["POST", "/sessions/revoke-others"], ["DELETE", "/sessions/00000000-0000-4000-8000-000000000000"]] as const) {
      expect((await call(m, p, null, m === "GET" || m === "DELETE" ? undefined : {})).status, `${m} ${p}`).toBe(401);
    }
  });

  it("rejects cross-site state changes", async () => {
    const u = await createUser(db);
    const { cookie } = await login(u.id);
    const res = await app.request("/api/me", { method: "PATCH", headers: { cookie, origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ name: "Hacked" }) });
    expect(res.status).toBe(403);
  });
});

describe("account", () => {
  it("returns name, phone and flags", async () => {
    const { owner } = await createSeller(db);
    await db.insert(admins).values({ userId: owner.id, role: "ADMIN", grantedBy: "test" });
    const { cookie } = await login(owner.id);
    expect(await (await call("GET", "", cookie)).json()).toMatchObject({ userId: owner.id, isSeller: true, isAdmin: true, adminRole: "ADMIN", phone: owner.phone });
  });

  it("renames, and validates", async () => {
    const u = await createUser(db);
    const { cookie } = await login(u.id);
    const ok = await call("PATCH", "", cookie, { name: "  Ananya  Sharma " });
    expect(await ok.json()).toEqual({ name: "Ananya Sharma" });
    expect((await call("PATCH", "", cookie, { name: "A" })).status).toBe(400);
    expect((await call("PATCH", "", cookie, { name: "Ok name", phone: "+919999999999" })).status).toBe(400); // strict: no other fields
    expect((await call("PATCH", "", cookie, {})).status).toBe(400);
  });
});

describe("preferences and in your sizes", () => {
  it("round-trips, normalising sizes, and feeds in-your-sizes", async () => {
    const { seller } = await createSeller(db);
    const l = await createListing(db, seller.id, { tagSize: "M" });
    const u = await createUser(db);
    const { cookie } = await login(u.id);

    expect(await (await call("GET", "/preferences", cookie)).json()).toEqual({ sizes: [], styles: [], maxBudgetPaise: null, isSet: false });
    const put = await call("PUT", "/preferences", cookie, { sizes: ["m", "M ", "uk 8"], styles: ["Denim", "Sneakers"], maxBudgetPaise: 200000 });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ sizes: ["M", "UK 8"], styles: ["Denim", "Sneakers"], maxBudgetPaise: 200000 });
    expect(await (await call("GET", "/preferences", cookie)).json()).toMatchObject({ sizes: ["M", "UK 8"], isSet: true });

    const mine = (await (await call("GET", "/in-your-sizes", cookie)).json()) as { sizes: string[]; items: { id: string }[] };
    expect(mine.items.map((i) => i.id)).toEqual([l.id]);
  });

  it("rejects unknown styles, too many sizes and tiny budgets; skipping (clearing) is allowed", async () => {
    const u = await createUser(db);
    const { cookie } = await login(u.id);
    const base = { sizes: [], styles: [], maxBudgetPaise: null };
    expect((await call("PUT", "/preferences", cookie, { ...base, styles: ["Cottagecore"] })).status).toBe(400);
    expect((await call("PUT", "/preferences", cookie, { ...base, sizes: Array.from({ length: 9 }, (_, i) => `S${i}`) })).status).toBe(400);
    expect((await call("PUT", "/preferences", cookie, { ...base, maxBudgetPaise: 10 })).status).toBe(400);
    expect((await call("PUT", "/preferences", cookie, { sizes: [] })).status).toBe(400);
    expect((await call("PUT", "/preferences", cookie, base)).status).toBe(200);
  });

  it("preferences are per user", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    await call("PUT", "/preferences", (await login(a.id)).cookie, { sizes: ["XL"], styles: [], maxBudgetPaise: null });
    expect(await (await call("GET", "/preferences", (await login(b.id)).cookie)).json()).toMatchObject({ sizes: [], isSet: false });
  });
});

describe("devices", () => {
  it("lists my sessions with device labels and the current one flagged, and never exposes tokens", async () => {
    const u = await createUser(db);
    const stranger = await createUser(db);
    const laptop = await login(u.id, CHROME);
    const phone = await login(u.id, IPHONE);
    await login(stranger.id);

    const res = await call("GET", "/sessions", laptop.cookie);
    const list = (await res.json()) as { id: string; deviceLabel: string; current: boolean }[];
    expect(list).toHaveLength(2);
    expect(list.find((s) => s.current)!.deviceLabel).toBe("Chrome on Windows");
    expect(list.find((s) => !s.current)!.deviceLabel).toBe("Safari on iOS");
    const raw = JSON.stringify(list);
    expect(raw).not.toContain(laptop.token);
    expect(raw).not.toContain(phone.token);
    expect(raw).not.toMatch(/token|hash/i);
  });

  it("revoking another device signs only that device out", async () => {
    const u = await createUser(db);
    const laptop = await login(u.id, CHROME);
    const phone = await login(u.id, IPHONE);
    const list = (await (await call("GET", "/sessions", laptop.cookie)).json()) as { id: string; current: boolean }[];
    const other = list.find((s) => !s.current)!;

    const res = await call("DELETE", `/sessions/${other.id}`, laptop.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, signedOut: false });
    expect(res.headers.getSetCookie().find((c) => c.startsWith(SESSION_COOKIE))).toBeUndefined();
    expect(await getSessionUser(db, phone.token)).toBeNull();
    expect(await getSessionUser(db, laptop.token)).not.toBeNull();
  });

  it("revoking the current device signs you out here and clears the cookie", async () => {
    const u = await createUser(db);
    const laptop = await login(u.id);
    const [self] = (await (await call("GET", "/sessions", laptop.cookie)).json()) as { id: string }[];
    const res = await call("DELETE", `/sessions/${self!.id}`, laptop.cookie);
    expect(await res.json()).toEqual({ ok: true, signedOut: true });
    expect(res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`))).toMatch(/Max-Age=0|Expires=/i);
    expect((await call("GET", "", laptop.cookie)).status).toBe(401);
  });

  it("can't revoke another account's session; ids are validated", async () => {
    const u = await createUser(db);
    const victim = await createUser(db);
    const mine = await login(u.id);
    const theirs = await login(victim.id);
    const [theirSession] = (await (await call("GET", "/sessions", theirs.cookie)).json()) as { id: string }[];
    expect((await call("DELETE", `/sessions/${theirSession!.id}`, mine.cookie)).status).toBe(404);
    expect(await getSessionUser(db, theirs.token)).not.toBeNull();
    expect((await call("DELETE", "/sessions/not-a-uuid", mine.cookie)).status).toBe(400);
  });

  it("revoke-others keeps this device and reports how many were signed out", async () => {
    const u = await createUser(db);
    const here = await login(u.id);
    const a = await login(u.id, IPHONE);
    const b = await login(u.id, IPHONE);
    const res = await call("POST", "/sessions/revoke-others", here.cookie, {});
    expect(await res.json()).toEqual({ ok: true, revoked: 2 });
    expect(await getSessionUser(db, a.token)).toBeNull();
    expect(await getSessionUser(db, b.token)).toBeNull();
    expect(await getSessionUser(db, here.token)).not.toBeNull();
    expect(await (await call("GET", "/sessions", here.cookie)).json()).toHaveLength(1);
  });
});

describe("saved addresses (existing routes)", () => {
  const addr = (cookie: string, method: string, path: string, body?: unknown) =>
    app.request(`/api/addresses${path}`, { method, headers: { cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

  it("list, edit, set default and delete work, and only on your own addresses", async () => {
    const a = await login((await createUser(db)).id);
    const b = await login((await createUser(db)).id);
    const first = (await (await addr(a.cookie, "POST", "", TEST_ADDRESS)).json()) as { id: string; isDefault: boolean };
    const second = (await (await addr(a.cookie, "POST", "", { ...TEST_ADDRESS, line1: "Flat 99, Other Road" })).json()) as { id: string };
    expect(first.isDefault).toBe(true);

    expect((await addr(a.cookie, "POST", `/${second.id}/default`)).status).toBe(200);
    const list = (await (await addr(a.cookie, "GET", "")).json()) as { id: string; isDefault: boolean }[];
    expect(list[0]).toMatchObject({ id: second.id, isDefault: true });

    expect((await addr(a.cookie, "PUT", `/${first.id}`, { ...TEST_ADDRESS, city: "Mumbai" })).status).toBe(200);

    // Another user can't see, edit, default or delete them.
    expect(await (await addr(b.cookie, "GET", "")).json()).toEqual([]);
    expect((await addr(b.cookie, "PUT", `/${first.id}`, TEST_ADDRESS)).status).toBe(404);
    expect((await addr(b.cookie, "POST", `/${first.id}/default`)).status).toBe(404);
    expect((await addr(b.cookie, "DELETE", `/${first.id}`)).status).toBe(404);

    // Deleting the default promotes the remaining address.
    expect((await addr(a.cookie, "DELETE", `/${second.id}`)).status).toBe(200);
    expect(await (await addr(a.cookie, "GET", "")).json()).toMatchObject([{ id: first.id, isDefault: true, city: "Mumbai" }]);
  });

  it("caps the address book at 10 with a 409", async () => {
    const a = await login((await createUser(db)).id);
    for (let i = 0; i < 10; i++) expect((await addr(a.cookie, "POST", "", { ...TEST_ADDRESS, line1: `Flat ${i}, Some Road` })).status).toBe(201);
    expect((await addr(a.cookie, "POST", "", TEST_ADDRESS)).status).toBe(409);
  });
});
