/** Browser tests get their own database and port, separate from `pnpm dev` and the unit tests. */
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://yolt:yolt@localhost:5433/yolt_e2e";
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
