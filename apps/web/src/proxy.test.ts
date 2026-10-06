import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const call = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) => proxy(new NextRequest(`http://localhost${path}`, init));

describe("staging gate", () => {
  beforeEach(() => {
    process.env.APP_ENV = "staging";
    process.env.STAGING_ACCESS_PASSWORD = "hunter2-hunter2";
  });
  afterEach(() => {
    delete process.env.APP_ENV;
    delete process.env.STAGING_ACCESS_PASSWORD;
  });

  it("asks for the password on pages and the API", () => {
    expect(call("/").status).toBe(401);
    expect(call("/api/orders").status).toBe(401);
  });

  it("lets a request with the password through", () => {
    const authorization = `Basic ${btoa("anyone:hunter2-hunter2")}`;
    expect(call("/", { headers: { authorization } }).status).toBe(200);
  });

  it.each(["/manifest.webmanifest", "/sw.js", "/sw-push.js", "/offline", "/api/health", "/api/cron/expire-holds", "/api/webhooks/cashfree"])(
    "does not gate %s, which browsers or servers fetch without credentials",
    (path) => {
      expect(call(path).status).toBe(200);
    },
  );

  it("does not gate look-alike paths", () => {
    expect(call("/offline/x").status).toBe(401);
    expect(call("/sw.js.map").status).toBe(401);
  });
});
