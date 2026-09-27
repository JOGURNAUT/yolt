import { NextResponse, type NextRequest } from "next/server";
import { FIRST_TOUCH_COOKIE, SELLER_HANDLE_PATTERN, SHARE_REF_PARAM } from "@yolt/shared";
import { appEnv } from "@/lib/env";

/** Server-to-server routes, authenticated by signature or secret, that must bypass the staging gate. */
const GATE_EXEMPT = [/^\/api\/webhooks\//, /^\/api\/cron\//, /^\/api\/health$/];

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Staging is a real deployment that shows login codes on screen, so the whole site — pages and
 * API — sits behind a shared password (HTTP Basic auth, any username).
 */
function stagingGate(request: NextRequest): NextResponse | null {
  const password = process.env.STAGING_ACCESS_PASSWORD;
  if (appEnv() !== "staging") return null;
  if (GATE_EXEMPT.some((r) => r.test(request.nextUrl.pathname))) return null;
  if (!password) return new NextResponse("Staging is locked: STAGING_ACCESS_PASSWORD is not set.", { status: 503 });

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = atob(encoded);
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (sameSecret(given, password)) return null;
  }
  return new NextResponse("YOLT staging: enter the access password.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="YOLT staging", charset="UTF-8"' },
  });
}

/**
 * Records how a browser first reached YOLT (decision D16): through a seller's share link
 * (?ref=<handle>) or anything else. First visit wins; the cookie is never overwritten here,
 * and the API copies it onto the account at login.
 */
function withFirstTouch(request: NextRequest, response: NextResponse) {
  if (request.nextUrl.pathname.startsWith("/api/") || request.cookies.has(FIRST_TOUCH_COOKIE)) return response;
  const ref = request.nextUrl.searchParams.get(SHARE_REF_PARAM);
  const at = new Date().toISOString();
  const value = ref && SELLER_HANDLE_PATTERN.test(ref) ? { type: "SELLER_LINK", sellerHandle: ref.toLowerCase(), at } : { type: "YOLT", at };
  response.cookies.set(FIRST_TOUCH_COOKIE, JSON.stringify(value), {
    httpOnly: true,
    sameSite: "lax",
    secure: appEnv() !== "development",
    path: "/",
    maxAge: 365 * 86_400,
  });
  return response;
}

export function proxy(request: NextRequest) {
  const blocked = stagingGate(request);
  if (blocked) return blocked;
  const response = NextResponse.next();
  if (appEnv() !== "production") response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return withFirstTouch(request, response);
}

export const config = {
  // Pages and API; skip Next internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
