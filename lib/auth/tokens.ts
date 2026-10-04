import "server-only";
import { createHmac, randomBytes } from "node:crypto";

/** Opaque, high-entropy refresh token (256 bits). */
export function createRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Random value for the double-submit CSRF cookie. */
export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this HMAC is stored; a database leak does not reveal usable refresh tokens. */
export function hashRefreshToken(token: string): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_REFRESH_SECRET is not configured");
  return createHmac("sha256", secret).update(token).digest("hex");
}
