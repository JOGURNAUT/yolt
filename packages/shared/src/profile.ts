/**
 * Rules for buyer preferences, seller applications and store settings. Browser-safe, so the
 * forms and the server validate the same way.
 */

// ---------------------------------------------------------------------------
// Buyer preferences
// ---------------------------------------------------------------------------

export const BUYER_STYLES = ["Streetwear", "Y2K", "Workwear", "Denim", "Vintage sports", "Kurtas & ethnic", "Sneakers", "Bags"] as const;
export type BuyerStyle = (typeof BUYER_STYLES)[number];

export const MAX_PREFERENCE_SIZES = 8;
export const MAX_SIZE_LENGTH = 20;

/** "  m " → "M", "uk  8" → "UK 8": the form sizes are stored and compared in. */
export function normalizeSize(input: string): string {
  return input.replace(/\s+/g, " ").trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Seller applications
// ---------------------------------------------------------------------------

export const APPLICATION_VOLUMES = ["UNDER_20", "BETWEEN_20_50", "BETWEEN_50_100", "OVER_100"] as const;
export type ApplicationVolume = (typeof APPLICATION_VOLUMES)[number];

export const APPLICATION_VOLUME_LABELS: Record<ApplicationVolume, string> = {
  UNDER_20: "Under 20 pieces a month",
  BETWEEN_20_50: "20 to 50 pieces a month",
  BETWEEN_50_100: "50 to 100 pieces a month",
  OVER_100: "More than 100 pieces a month",
};

/**
 * Instagram usernames: letters, numbers, periods and underscores, up to 30 characters.
 * Accepts "@Name", "name" and instagram.com links; returns null when it can't be a handle.
 */
export function normalizeInstagramHandle(input: string): string | null {
  let h = input.trim().toLowerCase();
  h = h.replace(/^(https?:\/\/)?(www\.)?instagram\.com\//, "").replace(/[/?#].*$/, "");
  h = h.replace(/^@/, "");
  if (!/^[a-z0-9._]{1,30}$/.test(h)) return null;
  if (h.includes("..") || h.endsWith(".")) return null;
  return h;
}

// ---------------------------------------------------------------------------
// Store settings
// ---------------------------------------------------------------------------

export const MAX_BIO_LENGTH = 160;
export const DISPATCH_DAYS_RANGE = { min: 1, max: 3 } as const;
/** Flat shipping the seller can charge: free up to ₹500. */
export const MAX_SHIPPING_FEE_PAISE = 50_000;
/** "Free shipping above" threshold: ₹100 to ₹50,000. */
export const FREE_SHIPPING_ABOVE_RANGE = { min: 10_000, max: 5_000_000 } as const;
