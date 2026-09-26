import "server-only";
import { randomBytes } from "node:crypto";
import {
  createApp,
  DevOtpSender,
  DevShippingProvider,
  mediaStorageFromEnv,
  SandboxPaymentProvider,
  UnconfiguredOtpSender,
  UnconfiguredPaymentProvider,
  UnconfiguredShippingProvider,
} from "@yolt/api";
import { db } from "./db";

const isProduction = process.env.NODE_ENV === "production";

// Development conveniences (sandbox payments, visible OTP codes, one-click login) exist only
// outside production. Production refuses payments and OTPs until Cashfree and MSG91 are configured.
const sandbox = isProduction ? undefined : new SandboxPaymentProvider(process.env.SANDBOX_WEBHOOK_SECRET ?? "dev-sandbox-secret");

// AUTH_PEPPER must be set in production. Without it, a random per-process value keeps codes
// unguessable, but they won't verify across instances, so login is effectively disabled.
const pepper = process.env.AUTH_PEPPER ?? (isProduction ? randomBytes(32).toString("hex") : "dev-auth-pepper");

export const api = createApp({
  db,
  payments: sandbox ?? new UnconfiguredPaymentProvider(),
  media: mediaStorageFromEnv(process.env),
  otp: isProduction ? new UnconfiguredOtpSender() : new DevOtpSender(),
  shipping: isProduction ? new UnconfiguredShippingProvider() : new DevShippingProvider(),
  authSecrets: { pepper },
  sandbox,
  allowDevAuth: !isProduction,
  cronSecret: process.env.CRON_SECRET,
});
