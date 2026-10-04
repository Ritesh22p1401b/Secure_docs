import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyAgainstDummy, verifyPassword } from "@/lib/auth/password";
import { createSession, setAuthCookies } from "@/lib/auth/session";
import { audit } from "@/lib/security/audit";
import {
  hitRateLimit,
  limits,
  peekRateLimit,
  resetRateLimit,
  tooManyRequests,
} from "@/lib/security/rate-limit";
import {
  assertSameOrigin,
  errorResponse,
  getClientIp,
  hashIp,
  jsonResponse,
  readJson,
  withErrorHandling,
} from "@/lib/security/request";
import { loginSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

const INVALID = "Invalid email or password.";

export const POST = withErrorHandling(async (req: NextRequest) => {
  assertSameOrigin(req);

  const ipHash = hashIp(getClientIp(req));
  const { loginIp, loginFailures } = limits();

  // Coarse per-IP limit on all attempts (slows password spraying).
  const ipResult = await hitRateLimit(`login:ip:${ipHash}`, loginIp.limit, loginIp.window);
  if (!ipResult.allowed) {
    await audit({ action: "RATE_LIMIT", request: req, metadata: { route: "login" } });
    throw tooManyRequests(ipResult);
  }

  const parsed = loginSchema.safeParse(await readJson(req));
  if (!parsed.success) return errorResponse(400, INVALID);
  const { email, password } = parsed.data;

  // Per IP+account failure window. The email is hashed so the table holds no PII.
  const emailKey = createHash("sha256").update(email).digest("hex").slice(0, 32);
  const failKey = `login:fail:${ipHash}:${emailKey}`;
  const failures = await peekRateLimit(failKey, loginFailures.limit);
  if (!failures.allowed) {
    await audit({ action: "RATE_LIMIT", request: req, metadata: { route: "login-failures" } });
    throw tooManyRequests(failures);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });
  const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyAgainstDummy(password);

  if (!user || !ok) {
    await hitRateLimit(failKey, loginFailures.limit, loginFailures.window);
    await audit({ action: "LOGIN_FAILURE", userId: user?.id ?? null, request: req });
    return errorResponse(401, INVALID);
  }

  await resetRateLimit(failKey);
  const tokens = await createSession(user.id);
  await audit({ action: "LOGIN_SUCCESS", userId: user.id, request: req });

  const res = jsonResponse({ success: true });
  setAuthCookies(res, tokens);
  return res;
});
