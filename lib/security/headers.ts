// Centralised security headers. Imported by next.config.ts and proxy.ts,
// so this module must not import server-only code or read secrets.

/** Vercel Blob client-upload API. Uploads go browser → Blob directly (never public). */
export const BLOB_UPLOAD_ORIGIN = "https://vercel.com/api/blob/";

function serialize(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([name, values]) => (values.length ? `${name} ${values.join(" ")}` : name))
    .join("; ");
}

/**
 * CSP for HTML pages. Scripts are allowed only via a per-request nonce
 * ('strict-dynamic' lets those trusted scripts load Next.js chunks).
 *
 * Documented exceptions:
 *  - 'unsafe-eval' in development only (React dev tooling); never in production.
 *  - 'wasm-unsafe-eval': pdf.js compiles its image decoders to WebAssembly. This permits
 *    WebAssembly compilation only — it does not allow eval() of JavaScript.
 *  - style-src 'unsafe-inline': React/pdf.js set inline style attributes. Styles cannot
 *    execute script; script-src remains strict.
 */
export function buildPageCsp(nonce: string, isDev: boolean): string {
  return serialize({
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "'wasm-unsafe-eval'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", BLOB_UPLOAD_ORIGIN],
    "worker-src": ["'self'", "blob:"],
    "media-src": ["'none'"],
    "object-src": ["'none'"],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "manifest-src": ["'self'"],
    ...(isDev ? {} : { "upgrade-insecure-requests": [] }),
  });
}

/** API responses are data only: nothing in them may execute or be framed. */
export const API_CSP = serialize({
  "default-src": ["'none'"],
  "frame-ancestors": ["'none'"],
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
  sandbox: [],
});

/** The pdf.js worker gets its own CSP (dedicated workers use their script's response CSP). */
export const PDF_WORKER_CSP = serialize({
  "default-src": ["'self'"],
  "script-src": ["'self'", "'wasm-unsafe-eval'"],
  "connect-src": ["'self'"],
  "object-src": ["'none'"],
  "frame-ancestors": ["'none'"],
});

export function baseSecurityHeaders(isProd: boolean): { key: string; value: string }[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), " +
        "display-capture=(), clipboard-read=(), browsing-topics=(), fullscreen=(self)",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    ...(isProd
      ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
      : []),
  ];
}

/**
 * Headers for confidential document bytes / rendered HTML.
 * Inline only (never `attachment`), never cached, never sniffed, sandboxed if opened directly.
 */
export function documentContentHeaders(contentType: string): Record<string, string> {
  return {
    "Content-Type": contentType,
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
    "Content-Security-Policy": API_CSP,
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    Vary: "Cookie, Range",
  };
}
