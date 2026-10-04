/**
 * Only same-origin relative paths are accepted as post-login redirects, preventing
 * open redirects such as ?next=//evil.example or ?next=https://evil.example.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw || raw.length > 512) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(raw)) return fallback;
  return raw;
}
