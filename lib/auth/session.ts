import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { HttpError } from "@/lib/security/request";
import { ACCESS_TOKEN_TTL_SECONDS, createAccessToken, verifyAccessToken } from "./jwt";
import { createCsrfToken, createRefreshToken, hashRefreshToken } from "./tokens";
import {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  REFRESH_COOKIE,
  authCookieOptions,
  csrfCookieOptions,
} from "./cookies";

/** Absolute session lifetime; refresh-token rotation does not extend it. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface AuthContext {
  userId: string;
  sessionId: string;
  email: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  expiresAt: Date;
}

export async function createSession(userId: string): Promise<IssuedTokens> {
  const refreshToken = createRefreshToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const session = await prisma.session.create({
    data: { userId, refreshHash: hashRefreshToken(refreshToken), expiresAt },
    select: { id: true },
  });
  return {
    accessToken: await createAccessToken(userId, session.id),
    refreshToken,
    csrfToken: createCsrfToken(),
    expiresAt,
  };
}

/**
 * Refresh-token rotation: the presented token is exchanged for a new one atomically.
 * A token that was already rotated, revoked or expired is rejected.
 */
export async function rotateRefreshToken(
  refreshToken: string | undefined,
): Promise<(IssuedTokens & { userId: string; sessionId: string }) | null> {
  if (!refreshToken || refreshToken.length > 256) return null;
  const oldHash = hashRefreshToken(refreshToken);
  const session = await prisma.session.findUnique({
    where: { refreshHash: oldHash },
    select: { id: true, userId: true, expiresAt: true, revokedAt: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;

  const newRefresh = createRefreshToken();
  // Conditional update: only succeeds if nobody rotated this token concurrently.
  const updated = await prisma.session.updateMany({
    where: { id: session.id, refreshHash: oldHash, revokedAt: null },
    data: { refreshHash: hashRefreshToken(newRefresh), rotatedAt: new Date() },
  });
  if (updated.count !== 1) return null;

  return {
    userId: session.userId,
    sessionId: session.id,
    accessToken: await createAccessToken(session.userId, session.id),
    refreshToken: newRefresh,
    csrfToken: createCsrfToken(),
    expiresAt: session.expiresAt,
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Resolve an access token to a live session. Hits the DB so revocation is immediate. */
async function resolveAccessToken(token: string | undefined): Promise<AuthContext | null> {
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  const session = await prisma.session.findFirst({
    where: {
      id: claims.sessionId,
      userId: claims.userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, user: { select: { id: true, email: true } } },
  });
  if (!session) return null;
  return { userId: session.user.id, sessionId: session.id, email: session.user.email };
}

/** For route handlers: authenticate from the request's cookies or throw 401. */
export async function requireAuth(req: NextRequest): Promise<AuthContext> {
  const auth = await resolveAccessToken(req.cookies.get(ACCESS_COOKIE)?.value);
  if (!auth) throw new HttpError(401, "Authentication required.");
  return auth;
}

/** Optional variant for routes that behave differently when signed in (e.g. logout). */
export async function getAuthFromRequest(req: NextRequest): Promise<AuthContext | null> {
  return resolveAccessToken(req.cookies.get(ACCESS_COOKIE)?.value);
}

/** For Server Components: the current user, or null. Memoised per request. */
export const getCurrentUser = cache(async (): Promise<AuthContext | null> => {
  const store = await cookies();
  return resolveAccessToken(store.get(ACCESS_COOKIE)?.value);
});

export async function hasRefreshCookie(): Promise<boolean> {
  return Boolean((await cookies()).get(REFRESH_COOKIE)?.value);
}

export function setAuthCookies(res: NextResponse, tokens: IssuedTokens) {
  const sessionSeconds = Math.max(
    0,
    Math.floor((tokens.expiresAt.getTime() - Date.now()) / 1000),
  );
  res.cookies.set(
    ACCESS_COOKIE,
    tokens.accessToken,
    authCookieOptions(Math.min(ACCESS_TOKEN_TTL_SECONDS, sessionSeconds)),
  );
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, authCookieOptions(sessionSeconds));
  res.cookies.set(CSRF_COOKIE, tokens.csrfToken, csrfCookieOptions(sessionSeconds));
}

export function clearAuthCookies(res: NextResponse) {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
    res.cookies.set(name, "", authCookieOptions(0));
  }
  res.cookies.set(CSRF_COOKIE, "", csrfCookieOptions(0));
}
