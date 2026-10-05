import postgres from "postgres";
import { E2E_DATABASE_URL } from "./env";
import { runDbScript } from "./db";

/** Creates the e2e database on first run and brings its schema up to date. Each spec reseeds it. */
export default async function globalSetup() {
  const url = new URL(E2E_DATABASE_URL);
  if (!/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) throw new Error("E2E_DATABASE_URL must point at a local database");
  const name = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Unexpected database name: ${name}`);

  const admin = postgres({ ...connectionOf(url), database: "postgres", max: 1, onnotice: () => {} });
  try {
    const [exists] = await admin`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (!exists) await admin.unsafe(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  runDbScript("migrate");
}

function connectionOf(url: URL) {
  return { host: url.hostname, port: Number(url.port || 5432), username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) };
}
