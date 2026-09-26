import "server-only";
import { createDb, type Db } from "@yolt/db";

const globalForDb = globalThis as unknown as { yoltDb?: Db };

function instance(): Db {
  if (!globalForDb.yoltDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (see apps/web/.env.example)");
    globalForDb.yoltDb = createDb(url, { max: 5 }).db;
  }
  return globalForDb.yoltDb;
}

/**
 * One connection pool per server process (survives dev hot reloads), created on first
 * use so `next build` doesn't need database credentials.
 */
export const db: Db = new Proxy({} as Db, {
  get: (_target, prop) => Reflect.get(instance(), prop),
});
