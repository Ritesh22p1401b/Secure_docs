import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { REFRESH_COOKIE } from "@/lib/auth/cookies";
import { clearAuthCookies, getAuthFromRequest, revokeSession } from "@/lib/auth/session";
import { hashRefreshToken } from "@/lib/auth/tokens";
import { audit } from "@/lib/security/audit";
import { assertSameOrigin, jsonResponse, withErrorHandling } from "@/lib/security/request";

export const runtime = "nodejs";

// Origin-checked only (no CSRF token): a user must always be able to log out,
// even if their CSRF cookie has expired. Forced logout is not a meaningful attack.
export const POST = withErrorHandling(async (req: NextRequest) => {
  assertSameOrigin(req);

  let userId: string | null = null;
  const auth = await getAuthFromRequest(req);
  if (auth) {
    await revokeSession(auth.sessionId);
    userId = auth.userId;
  } else {
    // Access token expired: revoke via the refresh token instead.
    const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
    if (refresh && refresh.length <= 256) {
      const session = await prisma.session.findUnique({
        where: { refreshHash: hashRefreshToken(refresh) },
        select: { id: true, userId: true },
      });
      if (session) {
        await revokeSession(session.id);
        userId = session.userId;
      }
    }
  }

  if (userId) await audit({ action: "LOGOUT", userId, request: req });

  const res = jsonResponse({ success: true });
  clearAuthCookies(res);
  return res;
});
