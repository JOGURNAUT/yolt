import "server-only";
import { createApp, mediaStorageFromEnv, SandboxPaymentProvider, UnconfiguredPaymentProvider } from "@yolt/api";
import { db } from "./db";

const isProduction = process.env.NODE_ENV === "production";

// Sandbox payments and dev login exist only outside production. Production refuses
// payments until the Cashfree adapter and real auth are in place.
const sandbox = isProduction ? undefined : new SandboxPaymentProvider(process.env.SANDBOX_WEBHOOK_SECRET ?? "dev-sandbox-secret");

export const api = createApp({
  db,
  payments: sandbox ?? new UnconfiguredPaymentProvider(),
  media: mediaStorageFromEnv(process.env),
  sandbox,
  allowDevAuth: !isProduction,
  cronSecret: process.env.CRON_SECRET,
});
