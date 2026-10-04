import type { NextRequest } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAuth } from "@/lib/auth/session";
import { STORAGE_NOT_CONFIGURED_LOG, storageDriver } from "@/lib/storage/blob";
import { authorizeClientUpload } from "@/lib/documents/service";
import {
  HttpError,
  assertMutationAllowed,
  jsonResponse,
  readJson,
  withErrorHandling,
} from "@/lib/security/request";

export const runtime = "nodejs";

/**
 * POST /api/documents/upload/token — Vercel Blob client-token exchange.
 * Only token generation is accepted here; no `callbackUrl` is configured, so there is
 * no unauthenticated completion webhook. Completion is the authenticated /complete call.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  assertMutationAllowed(req);
  const auth = await requireAuth(req);
  const driver = storageDriver();
  if (driver === "local") throw new HttpError(404, "Not found."); // local dev uploads use /upload/local/:id
  if (!driver) {
    console.error(`[securedocs] ${STORAGE_NOT_CONFIGURED_LOG}`);
    throw new HttpError(503, "Document uploads are not available: storage is not configured.");
  }

  const body = (await readJson(req)) as HandleUploadBody;
  if (!body || typeof body !== "object" || body.type !== "blob.generate-client-token") {
    throw new HttpError(400, "Invalid upload request.");
  }

  const result = await handleUpload({
    request: req,
    body,
    onBeforeGenerateToken: async (pathname, clientPayload) =>
      authorizeClientUpload(auth, pathname, clientPayload),
  });
  return jsonResponse(result);
});
