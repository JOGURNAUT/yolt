import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests live next to the code in src/. The browser tests in e2e/ run under Playwright (pnpm e2e).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"] },
});
