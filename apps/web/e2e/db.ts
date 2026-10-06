import { execSync } from "node:child_process";
import path from "node:path";
import postgres from "postgres";
import { E2E_DATABASE_URL } from "./env";

const repoRoot = path.resolve(__dirname, "../../..");

/** Runs a @yolt/db script (migrate, seed) against the e2e database. */
export function runDbScript(script: "migrate" | "seed") {
  execSync(`pnpm --filter @yolt/db ${script}`, {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: "pipe",
  });
}

/** Fresh demo data: the Second Loop store, demo buyers, sold items, reviews and a scheduled drop. */
export function reseed() {
  runDbScript("seed");
}

/** Direct database access for arranging state the UI can't reach quickly (e.g. moving a drop's start time). */
export async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}
