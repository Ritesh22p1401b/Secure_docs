// Browser-side fetch helper. Holds no secrets: auth lives in HttpOnly cookies the
// script cannot read. It only (1) echoes the CSRF cookie into a header on mutations,
// and (2) transparently refreshes the session once on 401.

import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/auth/cookies";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function csrfHeaders(): Record<string, string> {
  const token = readCookie(CSRF_COOKIE);
  return token ? { [CSRF_HEADER]: token } : {};
}

let refreshing: Promise<boolean> | null = null;

/** Single-flight refresh so parallel 401s trigger only one rotation. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

export function goToLogin() {
  const next = window.location.pathname;
  // Full navigation on purpose: drops all client state from the expired session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

export async function apiFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== "GET" && method !== "HEAD") {
    for (const [k, v] of Object.entries(csrfHeaders())) headers.set(k, v);
  }
  const res = await fetch(path, { ...init, headers, credentials: "same-origin", cache: "no-store" });
  if (res.status === 401 && retry) {
    if (await refreshSession()) return apiFetch(path, init, false);
    goToLogin();
  }
  return res;
}

export async function readErrorMessage(res: Response, fallback = "Something went wrong. Please try again."): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  } catch {
    /* non-JSON error */
  }
  return fallback;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
