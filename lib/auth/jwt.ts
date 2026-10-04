import "server-only";
import { SignJWT, jwtVerify, errors } from "jose";

// The algorithm is pinned: tokens with any other `alg` (including "none") are rejected.
const ALG = "HS256";
const ISSUER = "securedocs";
const AUDIENCE = "securedocs:web";
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

export async function createAccessToken(userId: string, sessionId: string): Promise<string> {
  return new SignJWT({ sessionId })
    .setProtectedHeader({ alg: ALG, typ: "JWT" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** Returns the claims, or null for any invalid/expired/tampered token. Never throws. */
export async function verifyAccessToken(token: string | undefined | null): Promise<AccessTokenClaims | null> {
  if (!token || token.length > 4096) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: [ALG],
      issuer: ISSUER,
      audience: AUDIENCE,
      requiredClaims: ["sub", "exp", "iat"],
    });
    const sessionId = payload.sessionId;
    if (typeof payload.sub !== "string" || typeof sessionId !== "string") return null;
    return { userId: payload.sub, sessionId };
  } catch (err) {
    if (!(err instanceof errors.JOSEError)) {
      console.error("Unexpected access token verification error");
    }
    return null;
  }
}
