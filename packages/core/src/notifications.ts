import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { drops, listings, notificationDeliveries, outboxEvents, pushSubscriptions, type Db, type Tx } from "@yolt/db";
import { deviceLabel } from "./account";
import type { PushMessage, PushSender } from "./push";

/**
 * Web push (docs/user-flows.md section 8). Outbox events that mean "tell someone" are expanded
 * into one `notification_deliveries` row per (user, thing), then each row is claimed and sent.
 *
 * Exactly once per user per thing:
 * - the unique (user_id, dedupe_key) makes queueing idempotent, so a second or concurrent run
 *   inserts nothing new;
 * - a row is claimed with FOR UPDATE SKIP LOCKED and flipped to SENDING before any network
 *   call, so two runs never send the same row.
 * A crash between sending and recording leaves the row SENDING; it is retried after
 * CLAIM_TIMEOUT_MS, so a crash can cause a repeat, never a loss.
 *
 * Drop reminders are transactional and asked for by the user, so quiet hours do not apply.
 * Payloads carry only the drop or item name, never anything about the person.
 */

export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 5;
export const PUSH_EVENT_TYPES = ["drop.starting_soon", "drop.opened", "listing.available"] as const;
const MAX_AGE_MS = 60 * 60_000;
const CLAIM_TIMEOUT_MS = 2 * 60_000;
const MAX_ATTEMPTS = 4;
const SEND_CONCURRENCY = 10;
/** Saved-item alerts for the same piece are at most one per user per window, so a hot item bouncing in and out of holds does not spam. */
const BACK_IN_STOCK_WINDOW_MS = 6 * 60 * 60_000;

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export type SubscribeResult = { ok: true; created: boolean } | { ok: false; reason: "INVALID_ENDPOINT" | "INVALID_KEYS" };

function validEndpoint(endpoint: string) {
  if (endpoint.length > 2000) return false;
  try {
    return new URL(endpoint).protocol === "https:";
  } catch {
    return false;
  }
}

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,256}$/;

/**
 * Saves this browser's subscription for the user. Idempotent by endpoint: subscribing again
 * refreshes the keys and revives a revoked row; an endpoint seen under another account moves to
 * the signed-in user (one browser profile, one owner at a time). At most
 * MAX_PUSH_SUBSCRIPTIONS_PER_USER devices stay active: the least recently used one is revoked.
 */
export async function subscribePush(
  db: Db,
  input: { userId: string; endpoint: string; p256dh: string; auth: string; userAgent?: string | null; now?: Date },
): Promise<SubscribeResult> {
  if (!validEndpoint(input.endpoint)) return { ok: false, reason: "INVALID_ENDPOINT" };
  if (!KEY_PATTERN.test(input.p256dh) || !KEY_PATTERN.test(input.auth)) return { ok: false, reason: "INVALID_KEYS" };
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`push-sub:${input.userId}`}))`);
    const [existing] = await tx
      .select({ userId: pushSubscriptions.userId, revokedAt: pushSubscriptions.revokedAt })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, input.endpoint));
    const values = {
      userId: input.userId,
      p256dh: input.p256dh,
      auth: input.auth,
      ...(input.userAgent ? { userAgent: deviceLabel(input.userAgent) } : {}),
      revokedAt: null,
    };
    if (existing) {
      await tx.update(pushSubscriptions).set(values).where(eq(pushSubscriptions.endpoint, input.endpoint));
    } else {
      await tx.insert(pushSubscriptions).values({ ...values, endpoint: input.endpoint, createdAt: now });
    }
    const active = await tx
      .select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, input.userId), isNull(pushSubscriptions.revokedAt)))
      .orderBy(desc(sql`coalesce(${pushSubscriptions.lastUsedAt}, ${pushSubscriptions.createdAt})`));
    const evict = active.filter((s) => s.endpoint !== input.endpoint).slice(MAX_PUSH_SUBSCRIPTIONS_PER_USER - 1);
    if (evict.length) {
      await tx
        .update(pushSubscriptions)
        .set({ revokedAt: now })
        .where(inArray(pushSubscriptions.id, evict.map((s) => s.id)));
    }
    return { ok: true, created: !existing || existing.revokedAt !== null || existing.userId !== input.userId } as const;
  });
}

/** Revokes the user's own subscription for this endpoint. Always succeeds: unknown or already revoked is fine. */
export async function unsubscribePush(db: Db, input: { userId: string; endpoint: string; now?: Date }) {
  const revoked = await db
    .update(pushSubscriptions)
    .set({ revokedAt: input.now ?? new Date() })
    .where(and(eq(pushSubscriptions.userId, input.userId), eq(pushSubscriptions.endpoint, input.endpoint), isNull(pushSubscriptions.revokedAt)))
    .returning({ id: pushSubscriptions.id });
  return { ok: true as const, revoked: revoked.length };
}

export async function listPushSubscriptions(db: Db, userId: string) {
  return db
    .select({ id: pushSubscriptions.id, userAgent: pushSubscriptions.userAgent, createdAt: pushSubscriptions.createdAt, lastUsedAt: pushSubscriptions.lastUsedAt })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), isNull(pushSubscriptions.revokedAt)))
    .orderBy(asc(pushSubscriptions.createdAt));
}

// ---------------------------------------------------------------------------
// Queueing: outbox events -> one delivery per user
// ---------------------------------------------------------------------------

type Delivery = { kind: string; dedupeKey: string; payload: PushMessage; userIdsSql: ReturnType<typeof sql> };

const hasActiveSubscription = (userIdColumn: ReturnType<typeof sql>) =>
  sql`EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = ${userIdColumn} AND s.revoked_at IS NULL)`;

async function insertDeliveries(tx: Tx, eventId: string, now: Date, d: Delivery) {
  const rows = await tx.execute(sql`
    INSERT INTO notification_deliveries (event_id, user_id, dedupe_key, kind, payload, next_attempt_at)
    SELECT ${eventId}::uuid, u.user_id, ${d.dedupeKey}, ${d.kind}, ${JSON.stringify(d.payload)}::jsonb, ${now.toISOString()}::timestamptz
    FROM (${d.userIdsSql}) u
    ON CONFLICT (user_id, dedupe_key) DO NOTHING
    RETURNING id`);
  return rows.length;
}

async function expandEvent(tx: Tx, now: Date, event: { id: string; type: string; payload: unknown; createdAt: Date }) {
  const payload = (event.payload ?? {}) as { dropId?: string; listingIds?: string[] };
  let queued = 0;

  if ((event.type === "drop.starting_soon" || event.type === "drop.opened") && payload.dropId) {
    const [drop] = await tx.select({ title: drops.title, status: drops.status }).from(drops).where(eq(drops.id, payload.dropId));
    const soon = event.type === "drop.starting_soon";
    // A drop cancelled (or already opened) since the reminder was queued is not worth a ping.
    if (!drop || (soon ? drop.status !== "SCHEDULED" : drop.status !== "LIVE" && drop.status !== "ENDED")) return 0;
    queued += await insertDeliveries(tx, event.id, now, {
      kind: event.type,
      dedupeKey: `${soon ? "drop-soon" : "drop-live"}:${payload.dropId}`,
      payload: soon
        ? { title: "Drop opens in 15 minutes", body: drop.title, url: `/d/${payload.dropId}`, tag: `drop-${payload.dropId}`, ttlSeconds: 900 }
        : { title: "Drop is live", body: `${drop.title} is open now`, url: `/d/${payload.dropId}`, tag: `drop-${payload.dropId}`, ttlSeconds: 900 },
      userIdsSql: sql`SELECT r.user_id FROM drop_reminders r WHERE r.drop_id = ${payload.dropId}::uuid AND ${hasActiveSubscription(sql`r.user_id`)}`,
    });
  }

  if (event.type === "listing.available" && payload.listingIds?.length) {
    const rows = await tx
      .select({ id: listings.id, slug: listings.slug, title: listings.title })
      .from(listings)
      .where(and(inArray(listings.id, payload.listingIds), eq(listings.status, "AVAILABLE")));
    const bucket = Math.floor(event.createdAt.getTime() / BACK_IN_STOCK_WINDOW_MS);
    for (const l of rows) {
      queued += await insertDeliveries(tx, event.id, now, {
        kind: event.type,
        dedupeKey: `back:${l.id}:${bucket}`,
        payload: { title: "Back in stock", body: `${l.title ?? "A piece you saved"} is available again`, url: `/p/${l.slug}`, tag: `back-${l.id}`, ttlSeconds: 3600 },
        userIdsSql: sql`SELECT si.user_id FROM saved_items si WHERE si.listing_id = ${l.id}::uuid AND ${hasActiveSubscription(sql`si.user_id`)}`,
      });
    }
  }
  return queued;
}

/** Turns unprocessed push-bound outbox events into deliveries. Other event types are left alone. */
export async function queueNotifications(db: Db, opts: { now?: Date; limit?: number } = {}) {
  const now = opts.now ?? new Date();
  return db.transaction(async (tx) => {
    const events = await tx
      .select()
      .from(outboxEvents)
      .where(and(isNull(outboxEvents.processedAt), inArray(outboxEvents.type, [...PUSH_EVENT_TYPES])))
      .orderBy(asc(outboxEvents.createdAt))
      .limit(opts.limit ?? 100)
      .for("update", { skipLocked: true });
    let queued = 0;
    let stale = 0;
    for (const e of events) {
      if (now.getTime() - e.createdAt.getTime() > MAX_AGE_MS) stale++;
      else queued += await expandEvent(tx, now, e);
    }
    if (events.length) {
      await tx
        .update(outboxEvents)
        .set({ processedAt: now })
        .where(inArray(outboxEvents.id, events.map((e) => e.id)));
    }
    return { events: events.length, queued, stale };
  });
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

type Claimed = typeof notificationDeliveries.$inferSelect;

async function claimDeliveries(db: Db, now: Date, limit: number): Promise<Claimed[]> {
  return db.transaction(async (tx) => {
    // Too old to be useful (e.g. push was off for a while): drop rather than send late.
    await tx
      .update(notificationDeliveries)
      .set({ status: "FAILED", lastError: "expired" })
      .where(
        and(
          inArray(notificationDeliveries.status, ["PENDING", "SENDING"]),
          lte(notificationDeliveries.createdAt, new Date(now.getTime() - MAX_AGE_MS)),
        ),
      );
    const staleClaim = new Date(now.getTime() - CLAIM_TIMEOUT_MS);
    const due = await tx
      .select({ id: notificationDeliveries.id })
      .from(notificationDeliveries)
      .where(
        and(
          sql`${notificationDeliveries.attempts} < ${MAX_ATTEMPTS}`,
          or(
            and(eq(notificationDeliveries.status, "PENDING"), lte(notificationDeliveries.nextAttemptAt, now)),
            and(eq(notificationDeliveries.status, "SENDING"), lte(notificationDeliveries.claimedAt, staleClaim)),
          ),
        ),
      )
      .orderBy(asc(notificationDeliveries.nextAttemptAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    return tx
      .update(notificationDeliveries)
      .set({ status: "SENDING", claimedAt: now, attempts: sql`${notificationDeliveries.attempts} + 1` })
      .where(inArray(notificationDeliveries.id, due.map((d) => d.id)))
      .returning();
  });
}

type Outcome = "SENT" | "SKIPPED" | "RETRY" | "FAILED";

async function sendOne(db: Db, sender: PushSender, delivery: Claimed, now: Date): Promise<{ outcome: Outcome; revoked: number }> {
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, delivery.userId), isNull(pushSubscriptions.revokedAt)));
  let delivered = 0;
  let retryable: string | null = null;
  const gone: string[] = [];
  const reached: string[] = [];
  // One subscription failing never stops the others.
  for (const s of subs) {
    try {
      const r = await sender.send({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, delivery.payload);
      if (r.status === "delivered") {
        delivered++;
        reached.push(s.id);
      } else if (r.status === "gone") gone.push(s.id);
      else retryable = r.error;
    } catch (err) {
      retryable = String((err as Error).message ?? err);
    }
  }
  if (gone.length) await db.update(pushSubscriptions).set({ revokedAt: now }).where(inArray(pushSubscriptions.id, gone));
  if (reached.length) await db.update(pushSubscriptions).set({ lastUsedAt: now }).where(inArray(pushSubscriptions.id, reached));

  const finish = (patch: Partial<typeof notificationDeliveries.$inferInsert>) =>
    db.update(notificationDeliveries).set(patch).where(eq(notificationDeliveries.id, delivery.id));

  // Delivered somewhere counts as sent: retrying would repeat the message on the devices that got it.
  if (delivered > 0) {
    await finish({ status: "SENT", sentAt: now, lastError: null });
    return { outcome: "SENT", revoked: gone.length };
  }
  if (retryable === null) {
    await finish({ status: "SKIPPED", lastError: subs.length === 0 ? "no active subscription" : "subscription gone" });
    return { outcome: "SKIPPED", revoked: gone.length };
  }
  if (delivery.attempts >= MAX_ATTEMPTS) {
    await finish({ status: "FAILED", lastError: retryable });
    return { outcome: "FAILED", revoked: gone.length };
  }
  await finish({ status: "PENDING", lastError: retryable, nextAttemptAt: new Date(now.getTime() + delivery.attempts * 2 * 60_000) });
  return { outcome: "RETRY", revoked: gone.length };
}

export type NotificationRun = {
  enabled: boolean;
  events: number;
  queued: number;
  sent: number;
  skipped: number;
  retrying: number;
  failed: number;
  revoked: number;
};

/**
 * One pass of the notifications job: queue, then claim and send up to `limit` deliveries.
 * Safe to run twice or concurrently (see the module comment). Does nothing while push is off.
 */
export async function deliverNotifications(db: Db, sender: PushSender, opts: { now?: Date; limit?: number } = {}): Promise<NotificationRun> {
  const run: NotificationRun = { enabled: sender.enabled, events: 0, queued: 0, sent: 0, skipped: 0, retrying: 0, failed: 0, revoked: 0 };
  if (!sender.enabled) return run;
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 100;
  const q = await queueNotifications(db, { now, limit });
  run.events = q.events;
  run.queued = q.queued;
  const claimed = await claimDeliveries(db, now, limit);
  for (let i = 0; i < claimed.length; i += SEND_CONCURRENCY) {
    const results = await Promise.all(
      claimed.slice(i, i + SEND_CONCURRENCY).map((d) =>
        sendOne(db, sender, d, now).catch(() => ({ outcome: "RETRY" as Outcome, revoked: 0 })),
      ),
    );
    for (const r of results) {
      run.revoked += r.revoked;
      if (r.outcome === "SENT") run.sent++;
      else if (r.outcome === "SKIPPED") run.skipped++;
      else if (r.outcome === "RETRY") run.retrying++;
      else run.failed++;
    }
  }
  return run;
}
