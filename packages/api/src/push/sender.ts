import webpush from "web-push";
import type { PushMessage, PushResult, PushSender, PushTarget } from "@yolt/core";

/** Sends through the browsers' push services with VAPID keys (`npx web-push generate-vapid-keys`). */
export class WebPushSender implements PushSender {
  readonly name = "web-push";
  readonly enabled = true;
  constructor(
    readonly publicKey: string,
    private readonly privateKey: string,
    private readonly subject: string,
  ) {}

  async send(target: PushTarget, message: PushMessage): Promise<PushResult> {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify({ title: message.title, body: message.body, url: message.url, tag: message.tag }),
        {
          vapidDetails: { subject: this.subject, publicKey: this.publicKey, privateKey: this.privateKey },
          TTL: message.ttlSeconds ?? 3600,
          urgency: "high",
          timeout: 10_000,
        },
      );
      return { status: "delivered" };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return { status: "gone" };
      return { status: "retryable", error: status ? `push service answered ${status}` : String((err as Error).message ?? err) };
    }
  }
}

export type SentPush = { target: PushTarget; message: PushMessage };

/**
 * Development and tests: records what would have been sent. The public key is a real generated
 * VAPID key so a browser can subscribe, but nothing leaves the machine. Set `outcome` to
 * simulate the push service's answers.
 */
export class FakePushSender implements PushSender {
  readonly name = "fake";
  readonly enabled = true;
  readonly publicKey: string;
  readonly sent: SentPush[] = [];
  outcome: (target: PushTarget) => PushResult = () => ({ status: "delivered" });
  constructor(private readonly log = false) {
    this.publicKey = webpush.generateVAPIDKeys().publicKey;
  }
  async send(target: PushTarget, message: PushMessage): Promise<PushResult> {
    if (this.log) console.info(`[dev push] ${message.title}: ${message.body} -> ${message.url}`);
    const result = this.outcome(target);
    if (result.status === "delivered") this.sent.push({ target, message });
    return result;
  }
}

/** Used when no VAPID keys are set: push is off, and a delivery attempt fails loudly instead of pretending. */
export class UnconfiguredPushSender implements PushSender {
  readonly name = "unconfigured";
  readonly enabled = false;
  readonly publicKey = null;
  async send(): Promise<never> {
    throw new Error("No push sender configured (set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT)");
  }
}

/**
 * Real keys win everywhere. Without them, development gets the fake and every other
 * environment gets the unconfigured sender, so push stays off rather than silently dropping messages.
 */
export function pushSenderFromEnv(env: Record<string, string | undefined>, opts: { allowFake: boolean }): PushSender {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env;
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) return new WebPushSender(VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT);
  return opts.allowFake ? new FakePushSender(true) : new UnconfiguredPushSender();
}
