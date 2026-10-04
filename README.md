# SecureDocs — Confidential Document Viewer

A production-oriented web application for uploading confidential **PDF** and **DOCX** documents to
private storage and reading them in the browser — with strict server-side authorisation, no download
workflow, and per-user watermarking.

> **Security limitation (read this first)**
>
> The application prevents normal application-level downloads and direct storage access. It does not
> provide DRM and cannot technically prevent screenshots, screen recording, browser inspection, or
> other methods of copying content after authorized rendering.

---

## Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Tech stack](#tech-stack)
4. [Security model](#security-model)
5. [Authentication](#authentication)
6. [Document storage & upload flow](#document-storage--upload-flow)
7. [PDF viewer](#pdf-viewer)
8. [DOCX viewer](#docx-viewer)
9. [Environment setup](#environment-setup)
10. [Database setup](#database-setup)
11. [Vercel & Vercel Blob setup](#vercel--vercel-blob-setup)
12. [Development commands](#development-commands)
13. [Testing](#testing)
14. [Security limitations](#security-limitations)
15. [Deployment checklist](#deployment-checklist)
16. [Troubleshooting](#troubleshooting)
17. [Future improvements](#future-improvements)

---

## Features

- Sign up / sign in with email + password (Argon2id), short-lived JWT access tokens in `HttpOnly`
  cookies, rotating refresh tokens, server-side session revocation and logout.
- Upload PDF and DOCX (default limit 25 MB) to **private** Vercel Blob storage.
- Multi-stage upload validation: extension, MIME, size, magic bytes, parsed structure, macro / encryption /
  zip-bomb checks — performed on the bytes actually stored, before a document becomes visible.
- In-browser PDF reader (pdf.js, canvas-only): page navigation, zoom, fit-to-width, page count, loading
  and error states, mobile-friendly.
- DOCX reader: server-side conversion (mammoth) + strict HTML sanitisation; the `.docx` itself never
  reaches the browser.
- Visible watermark (`CONFIDENTIAL` · user email · timestamp · document tag) — also burned into each
  rendered PDF page.
- Dashboard: upload with progress, list, filename search, sort, pagination, view, delete.
- **Sharing**: the owner clicks **Share** and enters another user's login email to grant **view-only**
  access; recipients find it under **Shared with me**. Access is revocable instantly; no public links.
- No download, print, save, export, "open original" or public-link controls anywhere.
- Security headers (nonce-based CSP, HSTS, `X-Frame-Options`, …), CSRF protection, PostgreSQL-backed rate
  limiting, audit logging, generic error messages.

## Architecture

```text
Browser (Next.js React UI, secure viewer)
   │  HTTPS — cookies only (HttpOnly access + refresh, readable CSRF token)
   ▼
Next.js app (single project, App Router, Node.js runtime)
   ├─ proxy.ts ............ early redirect for protected pages + per-request CSP nonce (NOT the security boundary)
   ├─ Server Components ... DB-backed session check in app/(protected)/layout.tsx and every page
   ├─ Route Handlers ...... /api/auth/*, /api/documents/* — each authenticates, authorises and validates itself
   ├─ lib/auth ............ JWT (jose, HS256 pinned), Argon2id, sessions, ownership checks
   ├─ lib/security ........ headers/CSP, CSRF, rate limiting, audit log, safe errors
   └─ lib/documents ....... validation (PDF/DOCX/ZIP), DOCX→safe HTML, upload/delete orchestration
   │                                   │
   ▼                                   ▼
PostgreSQL (Prisma 7)               Vercel Blob — PRIVATE store
 users, documents, document_shares, documents/{userId}/{documentId}
 sessions, audit_logs, pending_uploads,        read only server-side by the key recorded in the DB
 rate_limits
```

Key files:

| Concern | Location |
| --- | --- |
| Route protection (early) | `proxy.ts` |
| Session / JWT / cookies | `lib/auth/session.ts`, `lib/auth/jwt.ts`, `lib/auth/cookies.ts` |
| Authorisation gates (owner-only / view access) | `lib/auth/authorization.ts` |
| Sharing | `lib/documents/sharing.ts`, `components/documents/ShareDialog.tsx` |
| CSRF, safe errors, IP hashing | `lib/security/request.ts` |
| CSP & security headers | `lib/security/headers.ts`, `next.config.ts` |
| Rate limiting | `lib/security/rate-limit.ts` |
| Audit log | `lib/security/audit.ts` |
| Private storage | `lib/storage/blob.ts` |
| Upload validation | `lib/documents/validation.ts`, `pdf.ts`, `docx.ts`, `zip.ts` |
| Content endpoint | `app/api/documents/[documentId]/content/route.ts` |
| Viewer | `components/documents/*Viewer.tsx`, `SecurityWatermark.tsx` |

## Tech stack

Next.js 16 (App Router, Turbopack, `proxy.ts`) · React 19 · TypeScript (strict) · Tailwind CSS 4 ·
PostgreSQL · Prisma 7 (`@prisma/adapter-pg`) · jose · argon2 · Zod 4 · @vercel/blob (private) ·
pdfjs-dist 6 · mammoth · sanitize-html · Vitest · Playwright.

## Security model

**Never trust the client.** Authentication, authorisation, validation, storage access and every
security decision happen on the server.

| Threat | Control |
| --- | --- |
| Unauthorised access / IDOR | Two server-side gates using the session user: **view** = owner OR an explicit share row for that user (`requireViewAccess`); **owner-only** for delete and share management (`requireDocumentOwner`). Missing, malformed and inaccessible IDs all return an identical `404`. IDs are random UUIDv4. Covered by `tests/security/idor.test.ts` and `sharing.test.ts`. |
| Direct storage access | Private Blob store; objects are fetched server-side by the DB-recorded key only. No URL, token or storage key is ever returned to the browser. No `/download`, no generic proxy (no SSRF surface). |
| Ordinary downloading | No download/print/save UI. Content responses are `Content-Disposition: inline`, `Cache-Control: private, no-store`, sandboxed by CSP, and refused (`404`) unless requested by the in-app viewer (`x-securedocs-viewer` header, `Sec-Fetch-Dest: empty`) — so typing the URL, linking or framing it does not open it in the browser's native viewer. |
| Malicious uploads | Extension + MIME allowlist → size limit → magic bytes → full parse (pdf.js / OOXML package inspection) on the stored bytes. Rejects executables, `.docm`/macro parts, ActiveX, encrypted files, zip bombs, traversal entry names, malformed files. Rejected objects are deleted immediately. |
| XSS | DOCX HTML sanitised with a strict tag/attribute/scheme allowlist (no scripts, iframes, objects, event handlers, `javascript:`, styles, ids). Page CSP allows scripts only by per-request nonce (`'strict-dynamic'`). React escapes everything else. |
| CSRF | `SameSite` cookies + Origin/Fetch-Metadata validation on every mutation + double-submit CSRF token on authenticated mutations. No CORS is configured. |
| Session theft | `HttpOnly`, `Secure` (prod), `__Host-` prefixed cookies; 15-minute access JWTs re-checked against the session table on every request (revocation is immediate); refresh tokens are random, stored only as HMAC, rotated atomically on use. |
| Brute force | DB-backed rate limits: 5 failed logins / 15 min per IP+account, per-IP login and signup limits, per-user upload/view/delete limits. Time-boxed only — no permanent lockouts. |
| User enumeration | Identical login errors; Argon2 verification against a dummy hash when the account does not exist. |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY`. |
| Information leakage | Generic client errors; server logs record only error class/code. Audit logs store hashed IPs and never store passwords, tokens or content. |

### Sharing model

- The owner shares with an **existing account**, identified by its login email (the app has no separate
  usernames). Recipients get **view-only** access: the same secure viewer, watermarked with the
  *recipient's* identity. They cannot download, delete, re-share, or see who else has access.
- Each view request re-checks the share row, so **revoking takes effect immediately**. Deleting a document
  or an account removes its shares (database cascade). At most 50 recipients per document.
- There are no public or link-based shares and no invite-by-email: because signup does not verify email
  ownership, pre-granting access to an unregistered address would let anyone who registers it first
  receive the document. For the same reason, verify the recipient's address out of band before sharing
  highly sensitive material, or add email verification (see Future improvements).
- Sharing to an unknown email returns "No SecureDocs account uses that email address." This reveals
  whether an account exists, which is the accepted trade-off for a usable share dialog. Share attempts are
  rate-limited (`RATE_LIMIT_SHARES`, default 30/hour/user) and audited (`DOCUMENT_SHARE` /
  `DOCUMENT_UNSHARE`, `DOCUMENT_VIEW` records `access: owner|shared`).

### Account enumeration on signup

Signup with an existing email returns a generic "Unable to create an account with these details."
Without email verification it is impossible to make this fully indistinguishable from success; the
per-IP signup rate limit bounds probing. Adding verified-email signup would close this completely.

### Client-side deterrents

The viewer disables the context menu, drag, copy/cut, `Ctrl/Cmd+S`, `Ctrl/Cmd+P`, text selection and
printing (print CSS). These are **deterrents only, not a security boundary**; keyboard navigation and
screen-reader access are preserved.

**Capture shield** (`components/documents/useCaptureShield.ts`): the document is blurred and a
"Content hidden" notice shown while the window is unfocused or the tab hidden (e.g. the Snipping Tool
or ShareX region overlay, switching apps), while the pointer is outside the page (reaching for a
capture tool in the taskbar/tray), and for 3 s after Print Screen, the Windows key (Win+Shift+S) or
macOS Cmd+Shift+3/4/5. On Print Screen the clipboard is overwritten (best effort). Focus loss and
capture keys are recorded as `VIEWER_FOCUS_LOST` / `SCREEN_CAPTURE_SUSPECTED` audit events via
`POST /api/documents/:id/events` (CSRF-protected, view-access checked, rate limited). This **cannot
stop** tools that grab the screen on a global hotkey before the browser notices (e.g. ShareX's
default Print Screen capture), OS-level recorders, or a phone camera — the watermark is what
identifies the viewer in those captures.

## Authentication

- **Signup** → Zod validation → Argon2id hash → user + session → cookies.
- **Login** → Zod → rate-limit gate → Argon2id verify (dummy verify for unknown accounts) → session → cookies.
- **Access token**: JWT, HS256 (algorithm pinned on verify), issuer/audience checked, 15 minutes,
  payload `{ sub, sessionId, iat, exp, iss, aud }` only.
- **Refresh token**: 256-bit random, cookie only, stored as `HMAC-SHA256(JWT_REFRESH_SECRET, token)`,
  rotated on every refresh; sessions expire after 7 days (absolute).
- **Expiry handling**: API calls retry once after `POST /api/auth/refresh`; page navigations with an expired
  access token go through `/refresh`.
- **Logout** revokes the session row and clears cookies.
- Passwords: minimum 12, maximum 128 characters, no composition rules. Emails are NFKC-normalised,
  trimmed and lower-cased before every lookup.

## Document storage & upload flow

Vercel Functions cap request bodies at **4.5 MB**, so a 25 MB upload cannot pass through a route
handler. Bytes therefore go directly from the browser into the **private** Blob store, and validation
happens on the stored bytes before anything becomes visible:

```text
1. POST /api/documents/upload            auth + CSRF + rate limit + declared name/size/MIME checks
                                          → PendingUpload { id, storageKey: documents/{userId}/{id} }
2. POST /api/documents/upload/token      Vercel Blob client token, scoped to that exact pathname,
                                          the declared MIME type, the size limit, ≤ 15 min validity,
                                          no overwrite, no random suffix, no completion webhook
   browser → Vercel Blob (access: "private")
3. POST /api/documents/upload/complete   verify object is private → read bytes (size-capped)
                                          → magic bytes + full structural validation → SHA-256
                                          → Document row (transaction) → audit
                                          On any failure the stored object is deleted.
```

**Local development without Vercel:** when `BLOB_READ_WRITE_TOKEN` is empty and the app is not running
in production or on Vercel, a development-only driver (`lib/storage/local.ts`) stores files in the
gitignored `.local-storage/` folder (outside `public/`, never web-served). Step 2 becomes an authenticated,
CSRF-protected, size-capped `PUT /api/documents/upload/local/:uploadId`; steps 1 and 3 and all viewing
checks are unchanged. In production a missing token returns `503` — the local driver is never used there.

Abandoned uploads (never completed) are removed by the daily cron `GET /api/cron/cleanup`
(`vercel.json`, authenticated with `CRON_SECRET`), which also prunes expired sessions and rate-limit
counters.

API summary (all JSON, `Cache-Control: no-store`):

| Method & path | Purpose |
| --- | --- |
| `POST /api/auth/signup` · `login` · `logout` · `refresh` | Authentication (cookies only; tokens never in JSON) |
| `GET /api/documents?page&limit(1–50)&q&sort&scope=owned\|shared` | List own documents, or documents shared with me (metadata only) |
| `POST /api/documents/upload` · `upload/token` · `upload/complete` | Upload flow (above) |
| `GET /api/documents/:id` | Metadata |
| `GET /api/documents/:id/content` | Viewer-only content (PDF byte ranges ≤ 4 MiB, or sanitised DOCX HTML) |
| `DELETE /api/documents/:id` (or `POST …/:id/delete`) | Owner only. Delete: storage first, then metadata (shares cascade) |
| `GET` · `POST /api/documents/:id/shares` `{ email }` | Owner only: list recipients / share with a registered user |
| `DELETE /api/documents/:id/shares/:shareId` | Owner only: revoke access |
| `GET /api/health` | `{ "status": "ok" }` only |

## PDF viewer

pdf.js renders pages to `<canvas>` only — no text layer, no annotation links, no XFA, no scripting, and
the pdf.js JavaScript sandbox is not shipped. Bytes are loaded through an authenticated
`PDFDataRangeTransport` in 512 KB ranges, so large files stream on demand and every response stays
under serverless size limits. The watermark is drawn into each rendered page as well as overlaid.
The worker, fonts, CMaps and WASM decoders are copied to `public/pdfjs/` at `predev`/`prebuild`
(library assets only — documents never touch `/public`).

**Limitation:** the browser receives real PDF bytes. A technically capable user can reassemble them from
DevTools. A stronger future design renders pages to watermarked images on the server
(see [Future improvements](#future-improvements)).

## DOCX viewer

The server reads the private object, converts it with mammoth, and sanitises the HTML (headings,
paragraphs, lists, tables, basic formatting, `https`/`mailto` links with `rel="noopener noreferrer"`).
Images are inlined only as raster `data:` URIs within size budgets; other images are omitted with a
visible notice. Unsupported content is dropped, never executed.

## Environment setup

Requirements: Node.js 24 (`sanitize-html` needs ≥ 22.12; Vercel uses the `engines` field), PostgreSQL, a Vercel Blob **private** store.

```bash
npm install                # runs prisma generate
cp .env.example .env       # then fill it in
```

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL URL. On Vercel use a pooled URL (e.g. Neon `-pooler` host). |
| `JWT_SECRET` | yes | ≥ 32 chars, random: `openssl rand -base64 64` |
| `JWT_REFRESH_SECRET` | yes | Different random value. Keys the refresh-token HMAC. |
| `BLOB_READ_WRITE_TOKEN` | prod | Server-only. Never prefix with `NEXT_PUBLIC_`. Empty in local dev → `.local-storage/` is used. |
| `MAX_DOCUMENT_SIZE_MB` | no | Default 25. |
| `APP_URL` | no | Canonical origin, added to the CSRF Origin allowlist. |
| `CRON_SECRET` | prod | Bearer secret for `/api/cron/cleanup`. |
| `DATABASE_POOL_MAX` | no | pg pool size per instance (default 5). |
| `RATE_LIMIT_*` | no | Overrides; see `.env.example`. |

Secrets are validated at runtime (`lib/env.ts`): missing, short, known-weak or identical JWT secrets
are rejected.

## Database setup

```bash
npm run prisma:migrate     # development: create/apply migrations
npm run prisma:deploy      # production/CI: apply committed migrations
npm run prisma:studio
```

Models: `User`, `Document`, `Session`, `AuditLog`, `DocumentShare` (explicit view grants), plus `PendingUpload` (uploads awaiting validation)
and `RateLimit` (counters shared by all serverless instances). Document contents are never stored in
PostgreSQL.

For a quick local database without installing Postgres: `npx prisma dev` (single-connection emulator —
set `DATABASE_POOL_MAX=1`; use real PostgreSQL for anything beyond local development). Its databases
share one store, so `prisma migrate dev` (which needs a shadow database) fails there; generate migrations
against real PostgreSQL, or use `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`.

## Vercel & Vercel Blob setup

1. Push the repository to GitHub and import it into Vercel (framework: Next.js).
2. Add a PostgreSQL database (e.g. Neon via the Vercel Marketplace) and set `DATABASE_URL`.
3. Create a **Blob store with access set to _Private_** (Storage → Blob → Create). Connect it to the
   project; this provides `BLOB_READ_WRITE_TOKEN`. **Do not use a public store** — the app also verifies
   at upload completion that objects are on the private host and deletes anything that is not.
4. Set `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CRON_SECRET`, `APP_URL` (production URL),
   `MAX_DOCUMENT_SIZE_MB`.
5. Set the build command to `npm run prisma:deploy && npm run build` (or run migrations in CI).
6. Deploy. The daily cleanup cron in `vercel.json` is registered automatically.

`@vercel/blob` also supports Vercel OIDC (`VERCEL_OIDC_TOKEN` + `BLOB_STORE_ID`) for reads and deletes;
client-upload token generation still requires `BLOB_READ_WRITE_TOKEN`.

## Development commands

```bash
npm run dev            # next dev --turbopack
npm run build          # prisma generate && next build
npm run start
npm run lint
npm run typecheck
npm run test           # Vitest: unit + (with TEST_DATABASE_URL) integration & security
npm run test:coverage
npm run test:e2e       # Playwright (Chromium desktop + mobile)
```

## Testing

```bash
# Unit + security tests that need no database
npm test

# Full suite incl. auth, IDOR, upload and content tests (uses a SEPARATE database)
TEST_DATABASE_URL=postgres://…/securedocs_test npm test

# E2E (starts the dev server on :3200, or reuses one via E2E_PORT)
npx playwright install chromium
DATABASE_URL=postgres://… npm run test:e2e
```

| Suite | Covers |
| --- | --- |
| `tests/unit` | JWT (expired, tampered, `alg:none`, wrong alg/secret/audience), Argon2id, schemas, open-redirects, file validation (extensions, MIME confusion, malformed PDF/DOCX, macros, zip bombs, traversal), Range parsing |
| `tests/security` | IDOR (read/content/delete/enumerate/finalise across users), sharing (recipient view-only, outsiders blocked, immediate revocation, cascade on delete, unknown/self/duplicate recipients, CSRF, audit), XSS payloads through sanitiser and full DOCX pipeline, CSP/headers, proxy, CSRF |
| `tests/integration` | Signup/login/logout/refresh rotation/revocation, cookie flags, rate limiting, audit logging, full upload pipeline, content headers and ranges, pagination, SQL-injection attempts |
| `tests/e2e` | Redirects, CSP headers, signup → dashboard → logout, generic login error, PDF canvas rendering via authenticated ranges with no CSP violations, DOCX rendering, watermark, share → recipient views → revoke (desktop + mobile). Real Blob upload test runs when `BLOB_READ_WRITE_TOKEN` is set. |

Storage is replaced by an in-memory private store in integration tests; E2E viewer tests stub content
at the network layer. Run the Blob-backed E2E test against a real private store before release.

## Security limitations

- **Not DRM.** Screenshots, screen recording, photographs, DevTools/network inspection and modified
  browsers cannot be prevented once content is rendered for an authorised user. Watermarks deter and
  attribute leaks; they do not prevent them.
- PDF bytes reach the browser (in ranges). Deterrents (no download UI, header-gated content endpoint)
  stop ordinary saving, not a determined insider.
- Uploaded bytes sit briefly in private storage before validation (needed for >4.5 MB uploads on
  Vercel). They are never served until validated and are deleted on failure or by the cleanup cron.
- No malware scanning / content disarm (CDR) yet; files are parsed, never executed.
- `npm audit`: production dependencies report 0 vulnerabilities (Prisma CLI's `mysql2` and
  `deepmerge-ts` are pinned to patched versions via `overrides`). The remaining advisory (`braces`,
  no fixed version exists) is in ESLint's build-time tooling only and processes no user input.

## Deployment checklist

- [ ] HTTPS only; `APP_URL` set to the production origin
- [ ] Unique random `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CRON_SECRET`
- [ ] Blob store created as **Private**; token not exposed as `NEXT_PUBLIC_*`
- [ ] Migrations applied (`npm run prisma:deploy`)
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` pass
- [ ] `TEST_DATABASE_URL=… npm test` (IDOR/XSS/upload suites) pass
- [ ] `npm audit --omit=dev` clean
- [ ] Response headers verified (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy)
- [ ] Viewer tested on Chrome, Firefox, Edge and mobile
- [ ] Blob-backed E2E upload test run against the deployed environment

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Invalid server environment configuration` | A required variable is missing/weak; the message names it (never the value). |
| `503 Document uploads are not available: storage is not configured` | Production/Vercel without `BLOB_READ_WRITE_TOKEN`: connect a **private** Blob store. (Locally, uploads fall back to `.local-storage/`.) |
| Uploads fail at "Uploading securely…" | Check `BLOB_READ_WRITE_TOKEN`, that the store is **private**, and that the browser can reach `https://vercel.com/api/blob/` (allowed in CSP `connect-src`). |
| Upload completes then "could not be verified" | The object was not found on the private host — a public store or wrong token. |
| `403 Request rejected.` on POST | Origin mismatch (set `APP_URL` behind custom domains/proxies) or missing CSRF cookie (sign in again). |
| Pages don't hydrate in dev when opened via `127.0.0.1` | Next.js dev serves dev assets only to `localhost`; use `http://localhost:3000` or set `allowedDevOrigins`. |
| `429 Too many requests` | Rate limit hit; wait for `Retry-After` or tune `RATE_LIMIT_*`. |
| `prisma dev` connection drops | The emulator supports one connection: set `DATABASE_POOL_MAX=1`, or use real PostgreSQL. |
| PDF shows "could not be displayed" | Check `/pdfjs/pdf.worker.min.mjs` is served (run `npm run dev`/`build`, which copy the assets). |

## Future improvements

Designed for, not implemented in the MVP: verified-email signup (and invite-by-email sharing on top of it), share expiry dates, server-side page-image rendering with per-user watermarks
(original bytes never leave the server), malware scanning / CDR, envelope encryption with customer-managed
keys, 2FA/passkeys, SSO (SAML/OIDC), organisations and RBAC (no implicit admin access to content),
device/session management UI, IP
allowlisting, audit dashboard, document classification and DLP. Abandoned-object sweeps could also
reconcile Blob listings against the database.
