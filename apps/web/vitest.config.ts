import { defineConfig } from "vitest/config";

// Unit tests live next to the code in src/. The browser tests in e2e/ run under Playwright (pnpm e2e).
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
