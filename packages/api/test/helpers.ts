import { createSession } from "@yolt/core";
import type { Db } from "@yolt/db";
import { createApp, DevOtpSender, DevShippingProvider, MemoryMediaStorage, SandboxPaymentProvider, SESSION_COOKIE, type AppDeps } from "../src";

export function makeApp(db: Db, overrides: Partial<AppDeps> = {}) {
  const sandbox = new SandboxPaymentProvider("test-secret");
  const deps: AppDeps = {
    db,
    payments: sandbox,
    sandbox,
    media: new MemoryMediaStorage(),
    otp: new DevOtpSender(),
    authSecrets: { pepper: "test-pepper" },
    shipping: new DevShippingProvider(),
    devLogin: true,
    sandboxTools: true,
    exposeOtpCodes: true,
    secureCookies: false,
    cronSecret: "cron",
    ...overrides,
  };
  return { app: createApp(deps), deps, sandbox };
}

/** A real session cookie for the user, as a browser would hold after logging in. */
export async function sessionCookie(db: Db, userId: string) {
  const s = await createSession(db, { userId });
  return `${SESSION_COOKIE}=${s.sessionToken}`;
}
