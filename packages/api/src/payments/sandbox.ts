import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PaymentProvider } from "./provider";
import { WebhookVerificationError } from "./provider";

type SandboxWebhook = {
  eventId: string;
  type: "payment.succeeded" | "payment.failed";
  providerOrderId: string;
  amountPaise: number;
  currency: string;
};

/**
 * Local stand-in for a real gateway. It signs its "webhooks" with a shared secret so the
 * webhook route exercises the same verify → idempotent-handle path a real provider will.
 * Never enabled in production (see createApp).
 */
export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = "sandbox";
  constructor(private readonly secret: string) {}

  async createSession(input: { providerOrderId: string }) {
    return { sessionId: `sbx_session_${input.providerOrderId}` };
  }

  sign(body: string) {
    return createHmac("sha256", this.secret).update(body).digest("hex");
  }

  /** Builds a signed webhook request as the sandbox "gateway" would send it. */
  buildWebhook(event: Omit<SandboxWebhook, "eventId"> & { eventId?: string }) {
    const body = JSON.stringify({ eventId: event.eventId ?? `sbx_evt_${randomUUID()}`, ...event });
    return new Request("http://sandbox.local/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-sandbox-signature": this.sign(body) },
      body,
    });
  }

  async parseWebhook(request: Request) {
    const body = await request.text();
    const signature = request.headers.get("x-sandbox-signature") ?? "";
    const expected = this.sign(body);
    const valid =
      signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) throw new WebhookVerificationError("invalid sandbox signature");

    const event = JSON.parse(body) as SandboxWebhook;
    return {
      provider: this.name,
      providerEventId: event.eventId,
      type: event.type,
      providerOrderId: event.providerOrderId,
      providerPaymentId: `sbx_pay_${event.providerOrderId}`,
      amountPaise: event.amountPaise,
      currency: event.currency,
      payload: event,
    };
  }
}
