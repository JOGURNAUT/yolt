/** Only same-site paths, so ?next= can't bounce users to another site. */
export function safeNext(value: string | string[] | undefined) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

/** What the person was doing when sign-in was asked for; shown as the context line. */
export type SignInReason = "buy" | "follow" | "remind" | "checkout";

export function parseReason(value: string | string[] | undefined, next: string): SignInReason | null {
  if (value === "buy" || value === "follow" || value === "remind" || value === "checkout") return value;
  if (next.startsWith("/bag") || next.startsWith("/checkout")) return "checkout";
  if (next.startsWith("/p/")) return "buy";
  return null;
}

export const REASON_LINES: Record<SignInReason, string> = {
  buy: "Sign in to buy this piece",
  follow: "Sign in to follow this store",
  remind: "Sign in to get a reminder",
  checkout: "Sign in to check out",
};
