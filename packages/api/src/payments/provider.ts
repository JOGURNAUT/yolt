import type { PaymentEventInput } from "@yolt/core";

/**
 * Payment provider boundary. Cashfree is planned for launch (see docs/decisions.md);
 * the sandbox provider stands in until credentials and onboarding are ready.
 */
export interface PaymentProvider {
  readonly name: string;
  /** Create (or reuse) the provider-side order and return what the client needs to pay. */
  createSession(input: {
    providerOrderId: string;
    amountPaise: number;
    currency: string;
    orderReference: string;
    buyerId: string;
  }): Promise<{ sessionId: string; redirectUrl?: string }>;
  /** Verify a webhook's signature and translate it. Returns null for events we don't handle. */
  parseWebhook(request: Request): Promise<Omit<PaymentEventInput, "now"> | null>;
}

export class WebhookVerificationError extends Error {}

/** Used in production until the Cashfree adapter lands: refuses every payment instead of faking one. */
export class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly name = "unconfigured";
  async createSession(): Promise<never> {
    throw new Error("No payment provider configured");
  }
  async parseWebhook(): Promise<never> {
    throw new WebhookVerificationError("No payment provider configured");
  }
}
