// Cookie names and options. Shared by server code and the client fetch helper
// (which only needs the CSRF cookie name), so this file must stay free of secrets.

const prod = process.env.NODE_ENV === "production";

// `__Host-` binds the cookie to this exact origin (requires Secure, Path=/, no Domain).
const prefix = prod ? "__Host-" : "";

export const ACCESS_COOKIE = `${prefix}sd_access`;
export const REFRESH_COOKIE = `${prefix}sd_refresh`;
export const CSRF_COOKIE = `${prefix}sd_csrf`;
export const CSRF_HEADER = "x-csrf-token";

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict";
  path: string;
  maxAge: number;
}

export function authCookieOptions(maxAgeSeconds: number): CookieOptions {
  return { httpOnly: true, secure: prod, sameSite: "lax", path: "/", maxAge: maxAgeSeconds };
}

/** Readable by JS on purpose (double-submit CSRF token); carries no authority on its own. */
export function csrfCookieOptions(maxAgeSeconds: number): CookieOptions {
  return { httpOnly: false, secure: prod, sameSite: "strict", path: "/", maxAge: maxAgeSeconds };
}
