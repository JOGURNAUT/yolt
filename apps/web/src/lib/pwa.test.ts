import { describe, expect, it } from "vitest";
import { serviceWorkerEnabled } from "./pwa";

describe("serviceWorkerEnabled", () => {
  it("registers on deployed optimised builds", () => {
    expect(serviceWorkerEnabled("production", "production")).toBe(true);
    expect(serviceWorkerEnabled("staging", "production")).toBe(true);
  });

  it("never registers in development, even on an optimised build (the e2e server)", () => {
    expect(serviceWorkerEnabled("development", "production")).toBe(false);
    expect(serviceWorkerEnabled("development", "development")).toBe(false);
  });

  it("never registers under next dev, whatever APP_ENV says", () => {
    expect(serviceWorkerEnabled("production", "development")).toBe(false);
    expect(serviceWorkerEnabled("staging", undefined)).toBe(false);
  });
});
