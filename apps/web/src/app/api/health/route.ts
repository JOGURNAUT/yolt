import { sql } from "drizzle-orm";
import { appEnv, missingConfig } from "@/lib/env";
import { db } from "@/lib/server/db";

/**
 * Deployment health: is the database reachable and is every required setting present?
 * Lists missing setting *names* only, never values. Exempt from the staging password so
 * uptime checks can reach it.
 */
export async function GET() {
  const missing = missingConfig();
  let database: "ok" | "unreachable" = "ok";
  try {
    await db.execute(sql`select 1`);
  } catch {
    database = "unreachable";
  }
  const ok = database === "ok" && missing.length === 0;
  return Response.json({ ok, env: appEnv(), database, missingConfig: missing }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
