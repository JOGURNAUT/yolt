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
import { envFlags } from "@/lib/env";
import { db } from "./db";

const flags = envFlags();

// Sandbox payments, the dev courier and on-screen login codes run in development and staging.
// Production refuses payments, codes and courier bookings until Cashfree, MSG91 and Shiprocket
// adapters are configured, instead of faking them.
const sandbox = flags.sandboxTools ? new SandboxPaymentProvider(process.env.SANDBOX_WEBHOOK_SECRET ?? "dev-sandbox-secret") : undefined;

// AUTH_PEPPER must be set outside development. Without it, a random per-process value keeps codes
// unguessable, but they won't verify across instances, so login is effectively disabled.
const pepper = process.env.AUTH_PEPPER ?? (flags.env === "development" ? "dev-auth-pepper" : randomBytes(32).toString("hex"));

export const api = createApp({
  db,
  payments: sandbox ?? new UnconfiguredPaymentProvider(),
  media: mediaStorageFromEnv(process.env),
  otp: flags.exposeOtpCodes ? new DevOtpSender() : new UnconfiguredOtpSender(),
  shipping: flags.sandboxTools ? new DevShippingProvider(process.env.SANDBOX_WEBHOOK_SECRET ?? "dev-shipping-secret") : new UnconfiguredShippingProvider(),
  authSecrets: { pepper },
  sandbox,
  devLogin: flags.devLogin,
  sandboxTools: flags.sandboxTools,
  exposeOtpCodes: flags.exposeOtpCodes,
  secureCookies: flags.secureCookies,
  cronSecret: process.env.CRON_SECRET,
});
