import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { drops, listingPhotos, notificationDeliveries, outboxEvents, pushSubscriptions, savedItems } from "@yolt/db";
import {
  addListingToDrop,
  cancelDrop,
  createCheckout,
  createDrop,
  deliverNotifications,
  expireHolds,
  listPushSubscriptions,
  MAX_PUSH_SUBSCRIPTIONS_PER_USER,
  openDueDrops,
  queueDropReminders,
  scheduleDrop,
  setDropReminder,
  subscribePush,
  unsubscribePush,
  type PushMessage,
  type PushResult,
  type PushSender,
  type PushTarget,
} from "../src";
import { createListing, createSeller, createUser, testDb, truncateAll } from "./fixtures";

const { db, close } = testDb(40);
afterAll(close);
beforeEach(() => truncateAll(db));

const minutes = (n: number) => n * 60_000;
const after = (d: Date, ms: number) => new Date(d.getTime() + ms);

class RecordingSender implements PushSender {
  readonly name = "recording";
  enabled = true;
  publicKey = "key";
  sent: { target: PushTarget; message: PushMessage }[] = [];
  outcome: (t: PushTarget) => PushResult | Promise<PushResult> = () => ({ status: "delivered" });
  async send(target: PushTarget, message: PushMessage) {
    const r = await this.outcome(target);
    if (r.status === "delivered") this.sent.push({ target, message });
    return r;
  }
  to(endpoint: string) {
    return this.sent.filter((s) => s.target.endpoint === endpoint);
  }
}

const KEY = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
const AUTH = "tBHItJI5svbpez7KI4CCXg";
let n = 0;
const endpointFor = () => `https://push.test/send/${++n}`;
async function subscribe(userId: string, endpoint = endpointFor()) {
  const r = await subscribePush(db, { userId, endpoint, p256dh: KEY, auth: AUTH, userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile" });
  if (!r.ok) throw new Error(r.reason);
  return endpoint;
}
const active = (userId: string) => listPushSubscriptions(db, userId);

describe("subscriptions", () => {
  it("is idempotent by endpoint and refreshes keys", async () => {
    const u = await createUser(db);
    const e = endpointFor();
    expect(await subscribePush(db, { userId: u.id, endpoint: e, p256dh: KEY, auth: AUTH })).toEqual({ ok: true, created: true });
    expect(await subscribePush(db, { userId: u.id, endpoint: e, p256dh: KEY, auth: "anotherAuthSecret1" })).toEqual({ ok: true, created: false });
    const rows = await db.select().from(pushSubscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.auth).toBe("anotherAuthSecret1");
  });

  it("validates the endpoint and keys", async () => {
    const u = await createUser(db);
    const base = { userId: u.id, p256dh: KEY, auth: AUTH };
    expect(await subscribePush(db, { ...base, endpoint: "http://push.test/x" })).toEqual({ ok: false, reason: "INVALID_ENDPOINT" });
    expect(await subscribePush(db, { ...base, endpoint: "not a url" })).toEqual({ ok: false, reason: "INVALID_ENDPOINT" });
    expect(await subscribePush(db, { ...base, endpoint: endpointFor(), p256dh: "no spaces allowed" })).toEqual({ ok: false, reason: "INVALID_KEYS" });
  });

  it("scopes unsubscribe to the owner and is idempotent", async () => {
    const [a, b] = [await createUser(db), await createUser(db)];
    const e = await subscribe(a.id);
    expect(await unsubscribePush(db, { userId: b.id, endpoint: e })).toEqual({ ok: true, revoked: 0 });
    expect(await active(a.id)).toHaveLength(1);
    expect(await unsubscribePush(db, { userId: a.id, endpoint: e })).toEqual({ ok: true, revoked: 1 });
    expect(await unsubscribePush(db, { userId: a.id, endpoint: e })).toEqual({ ok: true, revoked: 0 });
    expect(await active(a.id)).toHaveLength(0);
    // Subscribing again revives the same row.
    expect(await subscribePush(db, { userId: a.id, endpoint: e, p256dh: KEY, auth: AUTH })).toEqual({ ok: true, created: true });
    expect(await db.select().from(pushSubscriptions)).toHaveLength(1);
  });

  it("moves an endpoint to whoever is signed in on that browser", async () => {
    const [a, b] = [await createUser(db), await createUser(db)];
    const e = await subscribe(a.id);
    await subscribe(b.id, e);
    expect(await active(a.id)).toHaveLength(0);
    expect(await active(b.id)).toHaveLength(1);
  });

  it("caps active devices per user by revoking the least recently used", async () => {
    const u = await createUser(db);
    const endpoints: string[] = [];
    for (let i = 0; i < MAX_PUSH_SUBSCRIPTIONS_PER_USER + 2; i++) {
      endpoints.push(await subscribe(u.id));
      await new Promise((r) => setTimeout(r, 5));
    }
    const live = await db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, u.id), isNull(pushSubscriptions.revokedAt)));
    expect(live.map((r) => r.endpoint).sort()).toEqual(endpoints.slice(2).sort());
  });

  it("holds the cap under concurrent subscribes", async () => {
    const u = await createUser(db);
    await Promise.all(Array.from({ length: 12 }, () => subscribe(u.id)));
    expect(await active(u.id)).toHaveLength(MAX_PUSH_SUBSCRIPTIONS_PER_USER);
  });
});

async function readyListing(sellerId: string, opts: Parameters<typeof createListing>[2] = {}) {
  const l = await createListing(db, sellerId, opts);
  await db.insert(listingPhotos).values(
    (["FRONT", "BACK", "LABEL", "FLAW"] as const).map((kind, position) => ({ listingId: l.id, kind, position, url: `https://media.test/${l.id}/${kind}.webp` })),
  );
  return l;
}

async function scheduledDrop() {
  const t0 = new Date();
  const { seller, owner } = await createSeller(db);
  const item = await readyListing(seller.id, { status: "DRAFT", publishedAt: null });
  const startsAt = after(t0, minutes(30));
  const d = await createDrop(db, { sellerId: seller.id, title: "Winter Vintage Drop", startsAt, maxHoldsPerBuyer: 2, now: t0 });
  if (!d.ok) throw new Error(d.reason);
  await addListingToDrop(db, { sellerId: seller.id, dropId: d.dropId, listingId: item.id });
  const s = await scheduleDrop(db, { sellerId: seller.id, dropId: d.dropId, actorUserId: owner.id, now: t0 });
  if (!s.ok) throw new Error(s.reason);
  return { seller, owner, dropId: d.dropId, startsAt };
}

/** `count` users who set a reminder and have one device each. */
async function remindedUsers(dropId: string, count: number) {
  const users = [];
  for (let i = 0; i < count; i++) {
    const u = await createUser(db, `Buyer ${i}`);
    await setDropReminder(db, { userId: u.id, dropId, on: true });
    users.push({ user: u, endpoint: await subscribe(u.id) });
  }
  return users;
}

describe("drop reminders", () => {
  it("sends the starting-soon push once per user, with only the drop name", async () => {
    const d = await scheduledDrop();
    const people = await remindedUsers(d.dropId, 2);
    const noDevice = await createUser(db);
    await setDropReminder(db, { userId: noDevice.id, dropId: d.dropId, on: true });
    const noReminder = await createUser(db);
    const strayEndpoint = await subscribe(noReminder.id);
    await queueDropReminders(db, { now: after(d.startsAt, -minutes(10)) });

    const sender = new RecordingSender();
    const run = await deliverNotifications(db, sender);
    expect(run).toMatchObject({ enabled: true, events: 1, queued: 2, sent: 2 });
    for (const p of people) {
      expect(sender.to(p.endpoint)).toHaveLength(1);
      expect(sender.to(p.endpoint)[0]!.message).toMatchObject({ title: "Drop opens in 15 minutes", body: "Winter Vintage Drop", url: `/d/${d.dropId}` });
      expect(JSON.stringify(sender.to(p.endpoint)[0]!.message)).not.toContain(p.user.name!);
    }
    expect(sender.to(strayEndpoint)).toHaveLength(0);

    // Another pass sends nothing more.
    expect(await deliverNotifications(db, sender)).toMatchObject({ events: 0, queued: 0, sent: 0 });
    expect(sender.sent).toHaveLength(2);
    const [evt] = await db.select().from(outboxEvents).where(eq(outboxEvents.type, "drop.starting_soon"));
    expect(evt!.processedAt).not.toBeNull();
  });

  it("is exactly once per user when the cron runs concurrently", async () => {
    const d = await scheduledDrop();
    const people = await remindedUsers(d.dropId, 25);
    await queueDropReminders(db, { now: after(d.startsAt, -minutes(10)) });
    const sender = new RecordingSender();
    // Slow sends widen the window in which a second run could grab the same rows.
    sender.outcome = async () => {
      await new Promise((r) => setTimeout(r, 15));
      return { status: "delivered" };
    };
    const runs = await Promise.all(Array.from({ length: 5 }, () => deliverNotifications(db, sender, { limit: 10 })));
    await deliverNotifications(db, sender);
    await deliverNotifications(db, sender);
    for (const p of people) expect(sender.to(p.endpoint)).toHaveLength(1);
    expect(sender.sent).toHaveLength(25);
    expect(runs.reduce((t, r) => t + r.sent, 0)).toBeLessThanOrEqual(25);
    expect(await db.select().from(notificationDeliveries).where(eq(notificationDeliveries.status, "SENT"))).toHaveLength(25);
  });

  it("does not queue twice even if the same event is delivered twice", async () => {
    const d = await scheduledDrop();
    await remindedUsers(d.dropId, 1);
    await db.insert(outboxEvents).values([
      { type: "drop.starting_soon", payload: { dropId: d.dropId } },
      { type: "drop.starting_soon", payload: { dropId: d.dropId } },
    ]);
    const sender = new RecordingSender();
    await deliverNotifications(db, sender);
    expect(sender.sent).toHaveLength(1);
  });

  it("sends a drop-is-live push when the drop opens, and skips cancelled drops", async () => {
    const d = await scheduledDrop();
    const [p] = await remindedUsers(d.dropId, 1);
    await openDueDrops(db, { now: d.startsAt });
    const sender = new RecordingSender();
    expect(await deliverNotifications(db, sender)).toMatchObject({ sent: 1 });
    expect(sender.to(p!.endpoint)[0]!.message).toMatchObject({ title: "Drop is live", url: `/d/${d.dropId}` });

    const e = await scheduledDrop();
    await remindedUsers(e.dropId, 1);
    await queueDropReminders(db, { now: after(e.startsAt, -minutes(10)) });
    await cancelDrop(db, { sellerId: e.seller.id, dropId: e.dropId, actorUserId: e.owner.id });
    const before = sender.sent.length;
    await deliverNotifications(db, sender);
    expect(sender.sent).toHaveLength(before);
    expect((await db.select().from(drops).where(eq(drops.id, e.dropId)))[0]!.status).toBe("CANCELLED");
  });

  it("does nothing while push is not configured, leaving events queued", async () => {
    const d = await scheduledDrop();
    await remindedUsers(d.dropId, 1);
    await queueDropReminders(db, { now: after(d.startsAt, -minutes(10)) });
    const sender = new RecordingSender();
    sender.enabled = false;
    expect(await deliverNotifications(db, sender)).toMatchObject({ enabled: false, sent: 0, events: 0 });
    expect((await db.select().from(outboxEvents).where(eq(outboxEvents.type, "drop.starting_soon")))[0]!.processedAt).toBeNull();
    sender.enabled = true;
    expect(await deliverNotifications(db, sender)).toMatchObject({ sent: 1 });
  });

  it("drops events that are more than an hour old instead of pinging late", async () => {
    const d = await scheduledDrop();
    await remindedUsers(d.dropId, 1);
    await queueDropReminders(db, { now: after(d.startsAt, -minutes(10)) });
    const sender = new RecordingSender();
    const run = await deliverNotifications(db, sender, { now: new Date(Date.now() + 2 * 3_600_000) });
    expect(run).toMatchObject({ events: 1, queued: 0, sent: 0 });
    expect(sender.sent).toHaveLength(0);
  });
});

describe("delivery outcomes", () => {
  it("revokes a subscription the push service reports gone, and still sends to the others", async () => {
    const d = await scheduledDrop();
    const u = await createUser(db);
    await setDropReminder(db, { userId: u.id, dropId: d.dropId, on: true });
    const [dead, alive] = [await subscribe(u.id), await subscribe(u.id)];
    await queueDropReminders(db, { now: after(d.startsAt, -minutes(10)) });
    const sender = new RecordingSender();
    sender.outcome = (t) => (t.endpoint === dead ? { status: "gone" } : { status: "delivered" });
    expect(await deliverNotifications(db, sender)).toMatchObject({ sent: 1, revoked: 1 });
    expect(sender.to(alive)).toHaveLength(1);
    const rows = await db.select().from(pushSubscriptions);
    expect(rows.find((r) => r.endpoint === dead)!.revokedAt).not.toBeNull();
    expect(rows.find((r) => r.endpoint === alive)!.revokedAt).toBeNull();
    expect(rows.find((r) => r.endpoint === alive)!.lastUsedAt).not.toBeNull();
  });

  it("marks a delivery skipped when every device is gone", async () => {
    const d = await scheduledDrop();
    const [p] = await remindedUsers(d.dropId, 1);
    await queueDropReminders(db, { now: after(d.startsAt, -minutes(10)) });
    const sender = new RecordingSender();
    sender.outcome = () => ({ status: "gone" });
    expect(await deliverNotifications(db, sender)).toMatchObject({ sent: 0, skipped: 1, revoked: 1 });
    expect(await active(p!.user.id)).toHaveLength(0);
  });

  it("retries transient failures later, then gives up, without blocking other users", async () => {
    const d = await scheduledDrop();
    const [flaky, fine] = await remindedUsers(d.dropId, 2);
    await queueDropReminders(db, { now: after(d.startsAt, -minutes(10)) });
    const sender = new RecordingSender();
    sender.outcome = (t) => {
      if (t.endpoint === flaky!.endpoint) throw new Error("socket hang up");
      return { status: "delivered" };
    };
    const t0 = new Date();
    expect(await deliverNotifications(db, sender, { now: t0 })).toMatchObject({ sent: 1, retrying: 1 });
    expect(sender.to(fine!.endpoint)).toHaveLength(1);
    // Not due yet.
    expect(await deliverNotifications(db, sender, { now: after(t0, 30_000) })).toMatchObject({ sent: 0, retrying: 0 });
    // Recovers on a later pass.
    sender.outcome = () => ({ status: "delivered" });
    expect(await deliverNotifications(db, sender, { now: after(t0, minutes(3)) })).toMatchObject({ sent: 1 });
    expect(sender.to(flaky!.endpoint)).toHaveLength(1);
    expect(sender.to(fine!.endpoint)).toHaveLength(1);
  });

  it("fails permanently after the attempt limit", async () => {
    const d = await scheduledDrop();
    await remindedUsers(d.dropId, 1);
    await queueDropReminders(db, { now: after(d.startsAt, -minutes(10)) });
    const sender = new RecordingSender();
    sender.outcome = () => ({ status: "retryable", error: "push service answered 503" });
    const t0 = new Date();
    let last = await deliverNotifications(db, sender, { now: t0 });
    for (let i = 1; i < 6; i++) last = await deliverNotifications(db, sender, { now: after(t0, minutes(10 * i)) });
    const [row] = await db.select().from(notificationDeliveries);
    expect(row).toMatchObject({ status: "FAILED", attempts: 4, lastError: "push service answered 503" });
    expect(last.sent).toBe(0);
  });

  it("reclaims a delivery whose runner died mid-send", async () => {
    const d = await scheduledDrop();
    const [p] = await remindedUsers(d.dropId, 1);
    await queueDropReminders(db, { now: after(d.startsAt, -minutes(10)) });
    const sender = new RecordingSender();
    sender.outcome = () => new Promise<never>(() => {});
    const t0 = new Date();
    void deliverNotifications(db, sender, { now: t0 });
    await new Promise((r) => setTimeout(r, 300));
    const fresh = new RecordingSender();
    expect(await deliverNotifications(db, fresh, { now: after(t0, 30_000) })).toMatchObject({ sent: 0 });
    expect(await deliverNotifications(db, fresh, { now: after(t0, minutes(3)) })).toMatchObject({ sent: 1 });
    expect(fresh.to(p!.endpoint)).toHaveLength(1);
  });
});

describe("saved item available again", () => {
  it("pings people who saved a piece when its hold expires, once", async () => {
    const { seller } = await createSeller(db);
    const listing = await createListing(db, seller.id);
    const [saver, other, nobody] = [await createUser(db), await createUser(db), await createUser(db)];
    const buyer = await createUser(db);
    await db.insert(savedItems).values([
      { userId: saver.id, listingId: listing.id },
      { userId: nobody.id, listingId: listing.id },
    ]);
    const saverEndpoint = await subscribe(saver.id);
    const otherEndpoint = await subscribe(other.id);

    const t0 = new Date();
    const c = await createCheckout(db, { buyerId: buyer.id, listingIds: [listing.id], now: t0 });
    expect(c.ok).toBe(true);
    // Reserved: nothing yet.
    const sender = new RecordingSender();
    await deliverNotifications(db, sender);
    expect(sender.sent).toHaveLength(0);

    await expireHolds(db, { now: after(t0, minutes(10)) });
    expect(await deliverNotifications(db, sender)).toMatchObject({ sent: 1 });
    expect(sender.to(saverEndpoint)[0]!.message).toMatchObject({ title: "Back in stock", url: `/p/${listing.slug}` });
    expect(sender.to(otherEndpoint)).toHaveLength(0);
    await deliverNotifications(db, sender);
    expect(sender.sent).toHaveLength(1);
  });

  it("does not repeat inside the cooldown when a piece bounces in and out of holds", async () => {
    const { seller } = await createSeller(db);
    const listing = await createListing(db, seller.id);
    const saver = await createUser(db);
    await db.insert(savedItems).values({ userId: saver.id, listingId: listing.id });
    await subscribe(saver.id);
    const buyer = await createUser(db);
    const sender = new RecordingSender();
    for (let i = 0; i < 3; i++) {
      const t = new Date();
      await createCheckout(db, { buyerId: buyer.id, listingIds: [listing.id], now: t });
      await expireHolds(db, { now: after(t, minutes(10)) });
      await deliverNotifications(db, sender);
    }
    expect(sender.sent).toHaveLength(1);
  });
});
