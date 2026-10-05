import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drops, listingPhotos } from "@yolt/db";
import { createListing, createSeller, createUser, testDb, truncateAll } from "../../core/test/fixtures";
import { makeApp, sessionCookie } from "./helpers";

const { db, close } = testDb(10);
afterAll(close);
beforeEach(() => truncateAll(db));

const { app } = makeApp(db);
const call = async (method: string, path: string, userId: string | null, body?: unknown) =>
  app.request(`/api${path}`, {
    method,
    headers: { ...(userId ? { cookie: await sessionCookie(db, userId) } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function readyListing(sellerId: string) {
  const l = await createListing(db, sellerId, { status: "DRAFT", publishedAt: null });
  await db.insert(listingPhotos).values((["FRONT", "BACK", "LABEL", "FLAW"] as const).map((kind, position) => ({ listingId: l.id, kind, position, url: `https://media.test/${l.id}/${position}` })));
  return l;
}

describe("drops over HTTP", () => {
  it("seller builds and schedules; buyers see it, set a reminder, and claim within the limit once it opens", async () => {
    const { seller, owner } = await createSeller(db);
    const [a, b] = [await readyListing(seller.id), await readyListing(seller.id)];
    const startsAt = new Date(Date.now() + 30 * 60_000).toISOString();

    const created = await call("POST", "/seller/drops", owner.id, { title: "Winter Vintage Drop", startsAt, maxHoldsPerBuyer: 1 });
    expect(created.status).toBe(201);
    const { dropId } = (await created.json()) as { dropId: string };
    for (const l of [a, b]) expect((await call("POST", `/seller/drops/${dropId}/items`, owner.id, { listingId: l.id })).status).toBe(200);
    expect((await call("POST", `/seller/drops/${dropId}/schedule`, owner.id)).status).toBe(200);

    const list = (await (await call("GET", "/drops", null)).json()) as { id: string; items: number }[];
    expect(list).toMatchObject([{ id: dropId, items: 2 }]);
    expect((await call("PUT", `/drops/${dropId}/reminder`, null, { on: true })).status).toBe(401);
    const buyer = await createUser(db);
    expect((await call("PUT", `/drops/${dropId}/reminder`, buyer.id, { on: true })).status).toBe(200);

    // Before it opens: nothing can be claimed.
    expect((await call("POST", "/checkout", buyer.id, { listingIds: [a.id] })).status).toBe(409);

    // Move the start into the past; the next read opens it.
    await db.update(drops).set({ startsAt: new Date(Date.now() - 1000) }).where(eq(drops.id, dropId));
    const live = (await (await call("GET", `/drops/${dropId}/live`, null)).json()) as { status: string; items: { status: string }[] };
    expect(live.status).toBe("LIVE");
    expect(live.items.map((i) => i.status)).toEqual(["AVAILABLE", "AVAILABLE"]);

    expect((await call("POST", "/checkout", buyer.id, { listingIds: [a.id] })).status).toBe(201);
    const second = await call("POST", "/checkout", buyer.id, { listingIds: [b.id] });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "DROP_LIMIT", details: { maxHoldsPerBuyer: 1 } });
  });

  it("validates input and ownership", async () => {
    const { owner } = await createSeller(db);
    const { owner: other } = await createSeller(db);
    const soon = new Date(Date.now() + 60_000).toISOString();
    expect(await (await call("POST", "/seller/drops", owner.id, { title: "Drop", startsAt: soon, maxHoldsPerBuyer: 1 })).json()).toEqual({ error: "TOO_SOON" });
    expect((await call("POST", "/seller/drops", owner.id, { title: "Drop", startsAt: "tomorrow", maxHoldsPerBuyer: 1 })).status).toBe(400);
    expect((await call("POST", "/seller/drops", owner.id, { title: "Drop", startsAt: new Date(Date.now() + 3_600_000).toISOString(), maxHoldsPerBuyer: 5 })).status).toBe(400);
    const { dropId } = (await (await call("POST", "/seller/drops", owner.id, { title: "Drop", startsAt: new Date(Date.now() + 3_600_000).toISOString(), maxHoldsPerBuyer: 2 })).json()) as { dropId: string };
    expect((await call("GET", `/seller/drops/${dropId}`, other.id)).status).toBe(404);
    expect((await call("GET", `/drops/${dropId}`, null)).status).toBe(404); // drafts aren't public
  });

  it("drops cron needs the secret", async () => {
    expect((await app.request("/api/cron/drops")).status).toBe(401);
    const r = await app.request("/api/cron/drops", { headers: { authorization: "Bearer cron" } });
    expect(await r.json()).toEqual({ queued: 0, opened: 0, ended: 0 });
  });
});
