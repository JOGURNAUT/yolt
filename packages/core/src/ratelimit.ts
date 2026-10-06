import { createHmac } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { rateLimitHits, type Db } from "@yolt/db";
import type { AuthSecrets } from "./auth";

/**
 * Small database-backed rate limiter for public forms (OTP keeps its own counters on its
 * challenge rows). Keys are HMACs, so neither raw IPs nor phone numbers are stored.
 */

export const rateLimitKey = (secrets: AuthSecrets, scope: string, value: string) =>
  `${scope}:${createHmac("sha256", secrets.pepper).update(`${scope}:${value}`).digest("hex")}`;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Records one attempt and says whether it's allowed. Attempts over the limit are not recorded,
 * so a blocked client isn't locked out longer by retrying.
 */
export async function hitRateLimit(
  db: Db,
  input: { key: string; limit: number; windowSeconds: number; now?: Date },
): Promise<RateLimitResult> {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - input.windowSeconds * 1000);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`rl:${input.key}`}))`);
    const hits = await tx
      .select({ createdAt: rateLimitHits.createdAt })
      .from(rateLimitHits)
      .where(and(eq(rateLimitHits.key, input.key), gt(rateLimitHits.createdAt, since)))
      .orderBy(rateLimitHits.createdAt);
    if (hits.length >= input.limit) {
      const oldest = hits[hits.length - input.limit]!.createdAt;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest.getTime() + input.windowSeconds * 1000 - now.getTime()) / 1000));
      return { ok: false, retryAfterSeconds } as const;
    }
    await tx.insert(rateLimitHits).values({ key: input.key, createdAt: now });
    return { ok: true } as const;
  });
}

