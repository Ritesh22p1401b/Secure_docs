import type { NextRequest } from "next/server";
import { REFRESH_COOKIE } from "@/lib/auth/cookies";
import { clearAuthCookies, rotateRefreshToken, setAuthCookies } from "@/lib/auth/session";
import { audit } from "@/lib/security/audit";
import { hitRateLimit, limits, tooManyRequests } from "@/lib/security/rate-limit";
import {
  assertSameOrigin,
  errorResponse,
  getClientIp,
  hashIp,
  jsonResponse,
  withErrorHandling,
} from "@/lib/security/request";

export const runtime = "nodejs";

export const POST = withErrorHandling(async (req: NextRequest) => {
  assertSameOrigin(req);

  const { refreshIp } = limits();
  const rl = await hitRateLimit(`refresh:ip:${hashIp(getClientIp(req))}`, refreshIp.limit, refreshIp.window);
  if (!rl.allowed) {
    await audit({ action: "RATE_LIMIT", request: req, metadata: { route: "refresh" } });
    throw tooManyRequests(rl);
  }

  const rotated = await rotateRefreshToken(req.cookies.get(REFRESH_COOKIE)?.value);
  if (!rotated) {
    await audit({ action: "AUTH_FAILURE", request: req, metadata: { reason: "refresh_rejected" } });
    const res = errorResponse(401, "Session expired. Please sign in again.");
    clearAuthCookies(res);
    return res;
  }

  await audit({ action: "TOKEN_REFRESH", userId: rotated.userId, request: req });
  const res = jsonResponse({ success: true });
  setAuthCookies(res, rotated);
  return res;
});
