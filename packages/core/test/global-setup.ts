import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { runMigrations } from "@yolt/db/migrate";

export default async function setup() {
  config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (copy .env.example to .env and run `pnpm db:up`)");

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await sql.end();
  await runMigrations(url);
}
