/** The boundary between YOLT and a push service. Implementations live in packages/api/src/push. */

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** What the service worker shows. Never carries personal data beyond what the notification is about. */
export type PushMessage = {
  title: string;
  body: string;
  /** Same-origin path opened when the notification is tapped. */
  url: string;
  /** Replaces an earlier notification with the same tag. */
  tag?: string;
  ttlSeconds?: number;
};

/**
 * - delivered: the push service accepted it.
 * - gone: the subscription no longer exists (HTTP 404 or 410); revoke it.
 * - retryable: anything else (rate limit, 5xx, network); try again later.
 */
export type PushResult = { status: "delivered" } | { status: "gone" } | { status: "retryable"; error: string };

export interface PushSender {
  readonly name: string;
  /** False when no keys are configured: nothing is subscribed or sent. */
  readonly enabled: boolean;
  /** The VAPID public key browsers subscribe with; null when disabled. */
  readonly publicKey: string | null;
  send(target: PushTarget, message: PushMessage): Promise<PushResult>;
}
