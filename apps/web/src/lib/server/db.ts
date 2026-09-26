import "server-only";
import { createDb, type Db } from "@yolt/db";

const globalForDb = globalThis as unknown as { yoltDb?: Db };

function init(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see apps/web/.env.example)");
  return createDb(url, { max: 5 }).db;
}

/** One connection pool per server process (survives dev hot reloads). */
export const db: Db = globalForDb.yoltDb ?? (globalForDb.yoltDb = init());
