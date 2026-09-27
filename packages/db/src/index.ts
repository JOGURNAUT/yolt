import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

export type Db = PostgresJsDatabase<typeof schema>;
/** A Drizzle transaction handle. Services accept `Db | Tx` so callers can compose them. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Connection pool. Serverless deployments should connect through a transaction-mode pooler
 * (Supabase port 6543), which doesn't support prepared statements, so they're turned off
 * automatically for that port or when DATABASE_PREPARE=false.
 */
export function createDb(url: string, options: { max?: number; prepare?: boolean } = {}) {
  const pooled = /:6543(\/|$)/.test(url) || process.env.DATABASE_PREPARE === "false";
  const client = postgres(url, { max: options.max ?? 10, prepare: options.prepare ?? !pooled, onnotice: () => {} });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end() };
}
