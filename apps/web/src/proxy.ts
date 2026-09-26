import { NextResponse, type NextRequest } from "next/server";
import { FIRST_TOUCH_COOKIE, SELLER_HANDLE_PATTERN, SHARE_REF_PARAM } from "@yolt/shared";

/**
 * Records how a browser first reached YOLT (decision D16): through a seller's share link
 * (?ref=<handle>) or anything else. First visit wins; the cookie is never overwritten here,
 * and the API copies it onto the account at login.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  if (request.cookies.has(FIRST_TOUCH_COOKIE)) return response;

  const ref = request.nextUrl.searchParams.get(SHARE_REF_PARAM);
  const at = new Date().toISOString();
  const value = ref && SELLER_HANDLE_PATTERN.test(ref) ? { type: "SELLER_LINK", sellerHandle: ref.toLowerCase(), at } : { type: "YOLT", at };

  response.cookies.set(FIRST_TOUCH_COOKIE, JSON.stringify(value), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 86_400,
  });
  return response;
}

export const config = {
  // Pages only: skip the API, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
