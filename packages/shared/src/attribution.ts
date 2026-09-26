/** First-touch attribution cookie (decision D16). Set once, on a browser's first visit. */
export const FIRST_TOUCH_COOKIE = "yolt_ft";
/** Query parameter on seller share links: /s/<handle>?ref=<handle> or /p/<slug>?ref=<handle>. */
export const SHARE_REF_PARAM = "ref";
export const SELLER_HANDLE_PATTERN = /^[a-z0-9._-]{2,40}$/i;

export function sellerShareUrl(origin: string, path: string, sellerHandle: string) {
  const url = new URL(path, origin);
  url.searchParams.set(SHARE_REF_PARAM, sellerHandle);
  return url.toString();
}
