import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createSession, setAuthCookies } from "@/lib/auth/session";
import { audit } from "@/lib/security/audit";
import { hitRateLimit, limits, tooManyRequests } from "@/lib/security/rate-limit";
import {
  assertSameOrigin,
  errorResponse,
  getClientIp,
  hashIp,
  jsonResponse,
  readJson,
  withErrorHandling,
} from "@/lib/security/request";
import { signupSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  assertSameOrigin(req);

  const ipHash = hashIp(getClientIp(req));
  const { signupIp } = limits();
  const rl = await hitRateLimit(`signup:ip:${ipHash}`, signupIp.limit, signupIp.window);
  if (!rl.allowed) {
    await audit({ action: "RATE_LIMIT", request: req, metadata: { route: "signup" } });
    throw tooManyRequests(rl);
  }

  const parsed = signupSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return errorResponse(400, parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const { email, password } = parsed.data;

  // Hash before touching the DB so new vs. existing emails take similar time.
  const passwordHash = await hashPassword(password);

  let userId: string;
  try {
    const user = await prisma.user.create({ data: { email, passwordHash }, select: { id: true } });
    userId = user.id;
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Deliberately generic; see README "Account enumeration" for the trade-off.
      return errorResponse(400, "Unable to create an account with these details.");
    }
    throw err;
  }

  const tokens = await createSession(userId);
  await audit({ action: "SIGNUP", userId, request: req });

  const res = jsonResponse({ success: true }, { status: 201 });
  setAuthCookies(res, tokens);
  return res;
});
