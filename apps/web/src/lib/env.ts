/**
 * Which deployment this is. NODE_ENV only says "optimised build or not", and staging is an
 * optimised build too, so behaviour keys off APP_ENV:
 *
 * - development: local machine. Everything fake and convenient, including one-click login.
 * - staging: a real deployment for demos, behind a shared password (STAGING_ACCESS_PASSWORD).
 *   Sandbox payments, the dev courier and on-screen login codes work; one-click login does not.
 * - production: real providers only. Anything not yet configured refuses instead of faking.
 */
export type AppEnv = "development" | "staging" | "production";

export function appEnv(): AppEnv {
  const v = process.env.APP_ENV;
  if (v === "development" || v === "staging" || v === "production") return v;
  // Unset APP_ENV on an optimised build is treated as production: fail safe, not open.
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export function envFlags(env: AppEnv = appEnv()) {
  return {
    env,
    devLogin: env === "development",
    sandboxTools: env !== "production",
    exposeOtpCodes: env !== "production",
    secureCookies: env !== "development",
    /** Search engines must never index staging. */
    indexable: env === "production",
  };
}

/** Env vars a deployment can't run without; checked by /api/health and at startup. */
export function missingConfig(env: AppEnv = appEnv()): string[] {
  if (env === "development") return [];
  const required = ["DATABASE_URL", "AUTH_PEPPER", "CRON_SECRET", "MEDIA_ENDPOINT", "MEDIA_BUCKET", "MEDIA_ACCESS_KEY_ID", "MEDIA_SECRET_ACCESS_KEY", "MEDIA_PUBLIC_BASE_URL"];
  if (env === "staging") required.push("STAGING_ACCESS_PASSWORD", "SANDBOX_WEBHOOK_SECRET");
  if (env === "production") required.push("LEGAL_ENTITY_NAME", "LEGAL_ADDRESS", "GRIEVANCE_OFFICER_NAME", "GRIEVANCE_EMAIL");
  return required.filter((k) => !process.env[k]);
}

const PUSH_KEYS = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;

/**
 * Settings that switch a feature on but don't stop the site without them. Web push stays off
 * (and the app hides its prompts) until all three VAPID values are set; /api/health reports them.
 */
export function missingOptionalConfig(env: AppEnv = appEnv()): string[] {
  if (env === "development") return [];
  return PUSH_KEYS.filter((k) => !process.env[k]);
}
