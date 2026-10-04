import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/auth/cookies";

/** An error whose message is safe to show to the client. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly publicMessage: string,
    public readonly headers?: Record<string, string>,
  ) {
    super(publicMessage);
  }
}

export const GENERIC_ERROR = "Unable to process the request.";
export const NOT_FOUND = "Not found.";

const NO_STORE = "private, no-store, max-age=0";

/** JSON response that is never cached by browsers or CDNs. */
export function jsonResponse(body: unknown, init: ResponseInit = {}): NextResponse {
  const res = NextResponse.json(body, init);
  res.headers.set("Cache-Control", NO_STORE);
  return res;
}

export function errorResponse(status: number, message: string, headers?: Record<string, string>) {
  return jsonResponse({ error: message }, { status, headers });
}

/**
 * Wraps a route handler: converts HttpError into a safe JSON error and every other
 * exception into a generic 500, logging only the error class server-side.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof HttpError) return errorResponse(err.status, err.publicMessage, err.headers);
      logServerError("Unhandled route error", err);
      return errorResponse(500, GENERIC_ERROR);
    }
  };
}

/** Logs an error without leaking request data, tokens or document contents. */
export function logServerError(context: string, err: unknown) {
  const name = err instanceof Error ? err.name : typeof err;
  const code =
    err && typeof err === "object" && "code" in err && typeof err.code === "string"
      ? ` code=${err.code}`
      : "";
  console.error(`[securedocs] ${context}: ${name}${code}`);
}

/**
 * Origins this request may legitimately come from: the URL Next.js reports, the
 * Host / X-Forwarded-Host the client actually connected to (dev servers and proxies may
 * normalise req.url), and APP_URL. A cross-site attacker cannot forge Host, and a
 * custom X-Forwarded-Host header would force a CORS preflight that is never granted.
 */
function expectedOrigins(req: Request): string[] {
  const url = new URL(req.url);
  const origins = new Set<string>([url.origin]);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host && /^[a-z0-9.\-[\]:]+$/i.test(host)) {
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.slice(0, -1);
    if (proto === "http" || proto === "https") origins.add(`${proto}://${host.toLowerCase()}`);
  }
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    try {
      origins.add(new URL(appUrl).origin);
    } catch {
      /* malformed APP_URL is reported by env() validation */
    }
  }
  return [...origins];
}

/**
 * CSRF layer 1: state-changing requests must come from our own origin.
 * Uses the Origin header, falling back to Fetch Metadata when Origin is absent.
 * Requests with neither are rejected.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) {
    if (!expectedOrigins(req).includes(origin)) throw new HttpError(403, "Request rejected.");
    return;
  }
  if (req.headers.get("sec-fetch-site") === "same-origin") return;
  throw new HttpError(403, "Request rejected.");
}

/**
 * CSRF layer 2 (authenticated, state-changing endpoints): double-submit token.
 * The header value must equal the CSRF cookie; a cross-site attacker can read neither.
 */
export function assertCsrfToken(req: NextRequest) {
  const cookie = req.cookies.get(CSRF_COOKIE)?.value ?? "";
  const header = req.headers.get(CSRF_HEADER) ?? "";
  if (cookie.length < 32 || header.length !== cookie.length) {
    throw new HttpError(403, "Request rejected.");
  }
  if (!timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
    throw new HttpError(403, "Request rejected.");
  }
}

/** Both CSRF layers, for authenticated mutations. */
export function assertMutationAllowed(req: NextRequest) {
  assertSameOrigin(req);
  assertCsrfToken(req);
}

/** Accepts a Request or a Server Component `headers()` result wrapped as `{ headers }`. */
export type HeaderSource = { headers: Headers };

export function getClientIp(req: HeaderSource): string {
  // On Vercel, x-real-ip / x-forwarded-for are set by the platform edge.
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return "unknown";
}

/** Keyed one-way hash so audit logs and rate-limit keys never contain raw IPs. */
export function hashIp(ip: string): string {
  const key = process.env.JWT_SECRET ?? "";
  return createHmac("sha256", key).update(`ip:${ip}`).digest("hex").slice(0, 32);
}

export function getUserAgent(req: HeaderSource): string | null {
  const ua = req.headers.get("user-agent");
  return ua ? ua.slice(0, 256) : null;
}

/** Parse a JSON body, rejecting oversized or non-JSON input. */
export async function readJson(req: Request, maxBytes = 16 * 1024): Promise<unknown> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Unsupported content type.");
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new HttpError(413, "Request too large.");
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid request body.");
  }
}
