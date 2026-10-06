import type { AppEnv } from "./env";

/**
 * Whether to register the service worker. Never in `next dev` (NODE_ENV) and never when
 * APP_ENV=development: the e2e server is an optimised build with APP_ENV=development, and a
 * worker there would cache pages across test runs. Staging and production register it.
 */
export function serviceWorkerEnabled(env: AppEnv, nodeEnv: string | undefined) {
  return nodeEnv === "production" && env !== "development";
}

/** Where the early listener below keeps Chrome's install event until the install card's provider mounts. */
export const INSTALL_EVENT_KEY = "__yoltInstallEvent";

/**
 * Runs in <head>. Chrome can fire beforeinstallprompt before React has hydrated, and the event
 * fires once, so catch it here and hand it to the install card's provider when it mounts.
 */
export const INSTALL_CAPTURE_SCRIPT = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.${INSTALL_EVENT_KEY}=e})`;
