import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createApp, DevOtpSender, DevShippingProvider, MemoryMediaStorage, UnconfiguredPaymentProvider } from "@yolt/api";
import type { Db } from "@yolt/db";

// Next.js answers 405 for any method this route file doesn't export, before Hono runs.
// This caught PATCH/PUT/DELETE silently failing in the listing editor.
describe("API mount", () => {
  it("exports a handler for every HTTP method the API registers", () => {
    const app = createApp({
      db: {} as Db,
      payments: new UnconfiguredPaymentProvider(),
      media: new MemoryMediaStorage(),
      otp: new DevOtpSender(),
      authSecrets: { pepper: "x" },
      shipping: new DevShippingProvider(),
      allowDevAuth: false,
    });
    const methods = new Set(app.routes.map((r) => r.method).filter((m) => m !== "ALL"));
    const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
    for (const m of methods) expect(source, `route.ts must export ${m}`).toContain(`export const ${m} = handler`);
  });
});
