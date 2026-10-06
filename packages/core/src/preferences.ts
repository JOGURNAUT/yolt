import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { BUYER_STYLES, MAX_PREFERENCE_SIZES, MAX_PRICE_PAISE, MAX_SIZE_LENGTH, MIN_PRICE_PAISE, normalizeSize, type BuyerStyle } from "@yolt/shared";
import { buyerPreferences, listings, sellers, type Db } from "@yolt/db";
import { LIVE_LISTING_STATUSES } from "./curation";
import { listingCardsByIds, type SearchHit } from "./search";

/**
 * Optional buyer preferences (docs/user-flows.md B-F4): sizes, styles and a per-piece budget.
 * They only power "In your sizes"; nothing is required and nothing is inferred.
 */

export const IN_YOUR_SIZES_LIMIT = 24;

export type Preferences = { sizes: string[]; styles: BuyerStyle[]; maxBudgetPaise: number | null };

export async function getPreferences(db: Db, userId: string): Promise<Preferences & { isSet: boolean }> {
  const [row] = await db.select().from(buyerPreferences).where(eq(buyerPreferences.userId, userId));
  if (!row) return { sizes: [], styles: [], maxBudgetPaise: null, isSet: false };
  return { sizes: row.sizes, styles: row.styles as BuyerStyle[], maxBudgetPaise: row.maxBudgetPaise, isSet: true };
}

export type SetPreferencesResult =
  | { ok: true; preferences: Preferences }
  | { ok: false; reason: "INVALID"; field: "sizes" | "styles" | "maxBudgetPaise" };

/** Replaces the buyer's preferences. Sizes are normalised ("m " → "M") and de-duplicated. */
export async function setPreferences(
  db: Db,
  input: { userId: string; sizes: string[]; styles: string[]; maxBudgetPaise: number | null; now?: Date },
): Promise<SetPreferencesResult> {
  const sizes = [...new Set(input.sizes.map(normalizeSize).filter((s) => s.length > 0))];
  if (sizes.length > MAX_PREFERENCE_SIZES || sizes.some((s) => s.length > MAX_SIZE_LENGTH)) return { ok: false, reason: "INVALID", field: "sizes" };
  const styles = [...new Set(input.styles)];
  if (!styles.every((s): s is BuyerStyle => (BUYER_STYLES as readonly string[]).includes(s))) return { ok: false, reason: "INVALID", field: "styles" };
  const budget = input.maxBudgetPaise;
  if (budget !== null && (!Number.isInteger(budget) || budget < MIN_PRICE_PAISE || budget > MAX_PRICE_PAISE)) {
    return { ok: false, reason: "INVALID", field: "maxBudgetPaise" };
  }
  const now = input.now ?? new Date();
  await db
    .insert(buyerPreferences)
    .values({ userId: input.userId, sizes, styles, maxBudgetPaise: budget, updatedAt: now })
    .onConflictDoUpdate({ target: buyerPreferences.userId, set: { sizes, styles, maxBudgetPaise: budget, updatedAt: now } });
  return { ok: true, preferences: { sizes, styles, maxBudgetPaise: budget } };
}

/** The tag size with case and repeated spaces ignored, as SQL, matching `normalizeSize`. */
const normalizedTagSize = sql`upper(regexp_replace(btrim(${listings.tagSize}), '[[:space:]]+', ' ', 'g'))`;

/** In-stock pieces whose tag size matches one of the buyer's sizes, newest first. */
export async function getInYourSizes(db: Db, userId: string): Promise<{ sizes: string[]; items: SearchHit[] }> {
  const { sizes } = await getPreferences(db, userId);
  if (sizes.length === 0) return { sizes, items: [] };
  const rows = await db
    .select({ id: listings.id })
    .from(listings)
    .innerJoin(sellers, eq(sellers.id, listings.sellerId))
    .where(and(inArray(listings.status, [...LIVE_LISTING_STATUSES]), eq(sellers.status, "APPROVED"), inArray(normalizedTagSize, sizes)))
    .orderBy(sql`${listings.publishedAt} DESC NULLS LAST`, desc(listings.createdAt))
    .limit(IN_YOUR_SIZES_LIMIT);
  return { sizes, items: await listingCardsByIds(db, rows.map((r) => r.id), { approvedOnly: true }) };
}
