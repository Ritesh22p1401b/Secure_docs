import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { HttpError } from "./request";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter stored in PostgreSQL so limits hold across all serverless
 * instances. The upsert is a single atomic statement (parameterised by Prisma).
 */
export async function hitRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "rate_limits" ("key", "count", "resetAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "rate_limits"."resetAt" <= now() THEN 1 ELSE "rate_limits"."count" + 1 END,
      "resetAt" = CASE WHEN "rate_limits"."resetAt" <= now()
                       THEN now() + make_interval(secs => ${windowSeconds})
                       ELSE "rate_limits"."resetAt" END
    RETURNING "count", "resetAt"`;
  const row = rows[0]!;
  const retryAfterSeconds = Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000));
  return { allowed: row.count <= limit, count: row.count, limit, retryAfterSeconds };
}

/** Read a counter without incrementing it (used to gate login before verifying). */
export async function peekRateLimit(key: string, limit: number): Promise<RateLimitResult> {
  const row = await prisma.rateLimit.findUnique({ where: { key } });
  if (!row || row.resetAt <= new Date()) {
    return { allowed: true, count: 0, limit, retryAfterSeconds: 0 };
  }
  const retryAfterSeconds = Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000));
  return { allowed: row.count < limit, count: row.count, limit, retryAfterSeconds };
}

export async function resetRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

export function tooManyRequests(result: RateLimitResult): HttpError {
  return new HttpError(429, "Too many requests. Please try again later.", {
    "Retry-After": String(result.retryAfterSeconds),
  });
}

/** Increment and throw 429 when exceeded. */
export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const result = await hitRateLimit(key, limit, windowSeconds);
  if (!result.allowed) throw tooManyRequests(result);
  return result;
}

const MIN = 60;
const HOUR = 60 * MIN;

/** Configurable limits (see .env.example). */
export function limits() {
  const e = env();
  return {
    loginFailures: { limit: e.RATE_LIMIT_LOGIN_FAILURES, window: 15 * MIN },
    loginIp: { limit: e.RATE_LIMIT_LOGIN_IP, window: 15 * MIN },
    signupIp: { limit: e.RATE_LIMIT_SIGNUP_IP, window: HOUR },
    refreshIp: { limit: e.RATE_LIMIT_REFRESH, window: 15 * MIN },
    uploads: { limit: e.RATE_LIMIT_UPLOADS, window: HOUR },
    view: { limit: e.RATE_LIMIT_VIEW, window: 10 * MIN },
    delete: { limit: e.RATE_LIMIT_DELETE, window: HOUR },
    shares: { limit: e.RATE_LIMIT_SHARES, window: HOUR },
  } as const;
}
