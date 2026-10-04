import type { NextConfig } from "next";
import { API_CSP, PDF_WORKER_CSP, baseSecurityHeaders } from "./lib/security/headers";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Node-only document processing libraries: keep them out of the bundle.
  serverExternalPackages: ["mammoth", "jszip", "sanitize-html", "pdfjs-dist"],
  async headers() {
    return [
      // Applied to every response. Page CSP (with nonce) is set per request in proxy.ts.
      { source: "/:path*", headers: baseSecurityHeaders(isProd) },
      {
        source: "/api/:path*",
        headers: [
          { key: "Content-Security-Policy", value: API_CSP },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      { source: "/pdfjs/:path*", headers: [{ key: "Content-Security-Policy", value: PDF_WORKER_CSP }] },
    ];
  },
};

export default nextConfig;
