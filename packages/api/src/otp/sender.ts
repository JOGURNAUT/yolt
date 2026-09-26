/** Delivers login codes. MSG91 (WhatsApp first, SMS fallback) in production; see docs/decisions.md. */
export interface OtpSender {
  readonly name: string;
  send(input: { phone: string; code: string; channel: "WHATSAPP" | "SMS" }): Promise<void>;
}

/**
 * Development only: keeps the latest code per phone in memory so the local login screen
 * can show it. createApp refuses to expose codes unless dev auth is enabled.
 */
export class DevOtpSender implements OtpSender {
  readonly name = "dev";
  private readonly latest = new Map<string, string>();
  async send(input: { phone: string; code: string }) {
    this.latest.set(input.phone, input.code);
    console.info(`[dev otp] ${input.phone}: ${input.code}`);
  }
  latestCode(phone: string) {
    return this.latest.get(phone);
  }
}

/** Production placeholder until MSG91 is configured: refuses to pretend a code was sent. */
export class UnconfiguredOtpSender implements OtpSender {
  readonly name = "unconfigured";
  async send(): Promise<never> {
    throw new Error("No OTP sender configured (MSG91 pending)");
  }
}
