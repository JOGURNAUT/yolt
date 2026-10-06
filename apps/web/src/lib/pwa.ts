import type { AppEnv } from "./env";

/**
 * Whether to register the service worker. Never in `next dev` (NODE_ENV) and never when
 * APP_ENV=development: the e2e server is an optimised build with APP_ENV=development, and a
 * worker there would cache pages across test runs. Staging and production register it.
 */
export function serviceWorkerEnabled(env: AppEnv, nodeEnv: string | undefined) {
  return nodeEnv === "production" && env !== "development";
}
