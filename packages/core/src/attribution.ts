import type { FirstTouch } from "@yolt/db";
import { SELLER_HANDLE_PATTERN } from "@yolt/shared";

/** Decision D16: a buyer who first arrived through a seller's share link is that seller's for 30 days. */
export const SELLER_LINK_WINDOW_DAYS = 30;

export function orderSourceFor(
  firstTouch: FirstTouch | null | undefined,
  sellerHandle: string,
  now: Date,
): "SELLER_LINK" | "YOLT_DISCOVERY" {
  if (!firstTouch || firstTouch.type !== "SELLER_LINK") return "YOLT_DISCOVERY";
  if (firstTouch.sellerHandle.toLowerCase() !== sellerHandle.toLowerCase()) return "YOLT_DISCOVERY";
  const age = now.getTime() - new Date(firstTouch.at).getTime();
  return age >= 0 && age <= SELLER_LINK_WINDOW_DAYS * 86_400_000 ? "SELLER_LINK" : "YOLT_DISCOVERY";
}

/** Parses the first-touch cookie defensively; anything malformed counts as no first touch. */
export function parseFirstTouch(raw: string | null | undefined): FirstTouch | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<FirstTouch> & { sellerHandle?: unknown };
    if (typeof v.at !== "string" || Number.isNaN(Date.parse(v.at))) return null;
    if (v.type === "YOLT") return { type: "YOLT", at: v.at };
    if (v.type === "SELLER_LINK" && typeof v.sellerHandle === "string" && SELLER_HANDLE_PATTERN.test(v.sellerHandle)) {
      return { type: "SELLER_LINK", sellerHandle: v.sellerHandle, at: v.at };
    }
  } catch {
    /* fall through */
  }
  return null;
}
