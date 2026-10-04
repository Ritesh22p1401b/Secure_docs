import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { requireViewAccess } from "@/lib/auth/authorization";
import { VIEWER_HEADER } from "@/lib/documents/constants";
import { convertDocxToSafeHtml } from "@/lib/documents/docx";
import { kindOf } from "@/lib/documents/metadata";
import { parseRangeHeader } from "@/lib/documents/range";
import { maxDocumentBytes } from "@/lib/documents/validation";
import { readPrivateObject, readPrivateObjectBytes } from "@/lib/storage/blob";
import { audit } from "@/lib/security/audit";
import { enforceRateLimit, limits } from "@/lib/security/rate-limit";
import { documentContentHeaders } from "@/lib/security/headers";
import { HttpError, NOT_FOUND, logServerError, withErrorHandling } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ documentId: string }> };

/**
 * GET /api/documents/:id/content — the only path to document bytes.
 * Authenticate → authorise ownership → read the PRIVATE object by the storage key
 * recorded in the database (never a client-supplied URL) → stream inline, no-store.
 */
export const GET = withErrorHandling(async (req: NextRequest, { params }: Ctx) => {
  const auth = await requireAuth(req);
  const { documentId } = await params;

  // Only the in-app viewer may fetch content: a typed URL / link / <iframe> cannot set
  // this header, and a cross-origin script would need a CORS preflight we never grant.
  const dest = req.headers.get("sec-fetch-dest");
  if (req.headers.get(VIEWER_HEADER) !== "1" || (dest && dest !== "empty")) {
    throw new HttpError(404, NOT_FOUND);
  }

  const { view } = limits();
  try {
    await enforceRateLimit(`view:user:${auth.userId}`, view.limit, view.window);
  } catch (err) {
    await audit({ action: "RATE_LIMIT", userId: auth.userId, request: req, metadata: { route: "content" } });
    throw err;
  }

  const doc = await requireViewAccess(auth, documentId); // owner or explicit share recipient
  const size = Number(doc.sizeBytes);

  if (kindOf(doc.mimeType) === "docx") {
    let bytes: Uint8Array | null;
    try {
      bytes = await readPrivateObjectBytes(doc.storageKey, maxDocumentBytes());
    } catch (err) {
      logServerError("DOCX read failed", err);
      throw new HttpError(500, "Unable to load the document.");
    }
    if (!bytes) throw new HttpError(404, NOT_FOUND);
    try {
      const { html, omittedImages } = await convertDocxToSafeHtml(bytes);
      const headers = documentContentHeaders("text/html; charset=utf-8");
      headers["X-Omitted-Images"] = String(omittedImages);
      return new Response(html, { status: 200, headers });
    } catch (err) {
      logServerError("DOCX conversion failed", err);
      throw new HttpError(422, "This document contains content that cannot be displayed safely.");
    }
  }

  const range = parseRangeHeader(req.headers.get("range"), size);
  if (range.kind === "invalid") {
    throw new HttpError(416, "Invalid range.", { "Content-Range": `bytes */${size}` });
  }

  const obj = await readPrivateObject(
    doc.storageKey,
    range.kind === "range" ? { start: range.start, end: range.end } : undefined,
  );
  if (!obj) throw new HttpError(404, NOT_FOUND);

  const headers: Record<string, string> = {
    ...documentContentHeaders("application/pdf"),
    "Accept-Ranges": "bytes",
  };
  if (range.kind === "range" && obj.contentRange) {
    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${size}`;
    headers["Content-Length"] = String(range.end - range.start + 1);
    return new Response(obj.stream, { status: 206, headers });
  }
  if (obj.contentLength !== null) headers["Content-Length"] = String(obj.contentLength);
  return new Response(obj.stream, { status: 200, headers });
});
