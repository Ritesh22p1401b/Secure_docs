import { NextResponse, type NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/cookies";
import { buildPageCsp } from "@/lib/security/headers";

// Early interception only. This is NOT the security boundary: every protected page
// and API route performs its own database-backed authentication and authorisation.

const PROTECTED_PREFIXES = ["/dashboard", "/documents"];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildPageCsp(nonce, process.env.NODE_ENV === "development");
  const { pathname } = request.nextUrl;

  if (isProtected(pathname)) {
    const claims = await verifyAccessToken(request.cookies.get(ACCESS_COOKIE)?.value);
    if (!claims) {
      const hasRefresh = Boolean(request.cookies.get(REFRESH_COOKIE)?.value);
      const url = new URL(hasRefresh ? "/refresh" : "/login", request.url);
      url.search = "";
      url.searchParams.set("next", pathname);
      const res = NextResponse.redirect(url);
      res.headers.set("Content-Security-Policy", csp);
      res.headers.set("Cache-Control", "private, no-store");
      return res;
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (isProtected(pathname)) {
    // Authenticated pages may embed user/document metadata: never cache them.
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|pdfjs|icons|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
