import { defineConfig, devices } from "@playwright/test";
import { E2E_DATABASE_URL, E2E_PORT } from "./e2e/env";

/**
 * Browser tests for the main user flows, against a production build (`next build` first) on its
 * own port and database, so they never touch the dev server or the dev data.
 * Run: pnpm --filter @yolt/web e2e
 */
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Specs reseed the shared database, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Most buyers arrive on a phone from an Instagram link.
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" } },
  ],
  webServer: {
    command: `pnpm exec next start --port ${E2E_PORT}`,
    // Wait for the port, not /api/health: global setup creates the database after the server starts.
    port: E2E_PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      APP_ENV: "development",
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_PEPPER: "e2e-auth-pepper",
      SANDBOX_WEBHOOK_SECRET: "e2e-sandbox-secret",
      CRON_SECRET: "e2e-cron-secret",
      MEDIA_ENDPOINT: process.env.MEDIA_ENDPOINT ?? "http://localhost:9000",
      MEDIA_BUCKET: "yolt-media",
      MEDIA_ACCESS_KEY_ID: "yolt",
      MEDIA_SECRET_ACCESS_KEY: "yolt-dev-secret",
      MEDIA_PUBLIC_BASE_URL: `${process.env.MEDIA_ENDPOINT ?? "http://localhost:9000"}/yolt-media`,
    },
  },
});
