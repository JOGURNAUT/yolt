import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSession, openClaim, respondToClaim } from "@yolt/core";
import { admins } from "@yolt/db";
import { SESSION_COOKIE } from "../src";
import { createUser, deliveredOrder, testDb, truncateAll } from "../../core/test/fixtures";
import { makeApp } from "./helpers";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));

const { app } = makeApp(db);

async function staff(role: "ADMIN" | "SUPPORT", sessionAgeHours = 0) {
  const u = await createUser(db, `${role} person`);
  await db.insert(admins).values({ userId: u.id, role, grantedBy: "test" });
  const s = await createSession(db, { userId: u.id, now: new Date(Date.now() - sessionAgeHours * 3_600_000) });
  return { user: u, cookie: `${SESSION_COOKIE}=${s.sessionToken}` };
}
const call = (method: string, path: string, cookie: string | null, body?: unknown) =>
  app.request(`/api/admin${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("admin access", () => {
  it("non-staff get 404 (the admin API doesn't reveal itself); signed-out get 401", async () => {
    const u = await createUser(db);
    const s = await createSession(db, { userId: u.id });
    expect((await call("GET", "/counts", `${SESSION_COOKIE}=${s.sessionToken}`)).status).toBe(404);
    expect((await call("GET", "/counts", null)).status).toBe(401);
  });

  it("stale admin sessions must sign in again", async () => {
    const { cookie } = await staff("ADMIN", 13);
    const r = await call("GET", "/counts", cookie);
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "REAUTH_REQUIRED" });
  });

  it("SUPPORT can read but not act", async () => {
    const { cookie } = await staff("SUPPORT");
    expect((await call("GET", "/counts", cookie)).status).toBe(200);
    const r = await call("POST", "/sellers", cookie, { phone: "9811122233", handle: "x1", displayName: "X", pickupPincode: "560001", pickupState: "Karnataka" });
    expect(r.status).toBe(403);
  });

  it("there is no API to grant admin rights", async () => {
    const { cookie } = await staff("ADMIN");
    for (const path of ["/admins", "/grant", "/users/role"]) expect((await call("POST", path, cookie, {})).status).toBe(404);
  });

  it("cron and public routes are unaffected by the admin middleware", async () => {
    expect((await app.request("/api/cron/expire-holds", { headers: { authorization: "Bearer cron" } })).status).toBe(200);
    expect((await app.request("/api/search")).status).toBe(200);
  });
});

describe("admin actions over HTTP", () => {
  it("decide an escalated claim, then clear the refund", async () => {
    const p = await deliveredOrder(db);
    const c = await openClaim(db, { buyerId: p.buyer.id, orderId: p.orderId, reason: "DAMAGED", description: "Torn sleeve seam", photoUrls: ["https://media.test/a.webp"] });
    if (!c.ok) throw new Error();
    await respondToClaim(db, { sellerId: p.seller.id, claimId: c.claimId, actorUserId: p.owner.id, action: "DISPUTE", response: "Was fine when shipped" });

    const { cookie } = await staff("ADMIN");
    const queue = (await (await call("GET", "/claims?status=ESCALATED", cookie)).json()) as { claim: { id: string } }[];
    expect(queue.map((q) => q.claim.id)).toEqual([c.claimId]);

    expect((await call("POST", `/claims/${c.claimId}/decide`, cookie, { decision: "REFUND", reason: "" })).status).toBe(400);
    const decided = await call("POST", `/claims/${c.claimId}/decide`, cookie, { decision: "REFUND", reason: "Tear visible in courier handover photo" });
    expect(await decided.json()).toMatchObject({ ok: true, refundId: expect.any(String) });

    const refunds = (await (await call("GET", "/refunds?open=1", cookie)).json()) as { refund: { id: string } }[];
    expect(refunds).toHaveLength(1);
    expect((await call("POST", `/refunds/${refunds[0]!.refund.id}/succeeded`, cookie, { providerRefundId: "rfnd_TEST01" })).status).toBe(200);
    const audit = (await (await call("GET", "/audit", cookie)).json()) as { action: string }[];
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["claim.decided_refund", "refund.marked_succeeded"]));
  });

  it("onboard a store, verify KYC, then suspend it: its listings can't be bought", async () => {
    const { cookie } = await staff("ADMIN");
    const r = await call("POST", "/sellers", cookie, { phone: "98111 22233", handle: "retrorack", displayName: "Retro Rack", pickupPincode: "560001", pickupState: "Karnataka" });
    expect(r.status).toBe(201);
    const { sellerId } = (await r.json()) as { sellerId: string };
    expect((await call("POST", `/sellers/${sellerId}/status`, cookie, { action: "VERIFY_KYC", reason: "PAN + bank checked" })).status).toBe(200);
    expect((await call("POST", `/sellers/${sellerId}/status`, cookie, { action: "SUSPEND", reason: "x" })).status).toBe(400);
    expect((await call("POST", `/sellers/${sellerId}/status`, cookie, { action: "SUSPEND", reason: "Counterfeit reports" })).status).toBe(200);
  });
});
