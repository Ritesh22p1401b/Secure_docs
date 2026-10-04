import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { STORAGE_NOT_CONFIGURED_LOG, isUploadStorageConfigured } from "@/lib/storage/blob";
import { createPendingUpload } from "@/lib/documents/service";
import { audit } from "@/lib/security/audit";
import { hitRateLimit, limits, tooManyRequests } from "@/lib/security/rate-limit";
import {
  HttpError,
  assertMutationAllowed,
  jsonResponse,
  readJson,
  withErrorHandling,
} from "@/lib/security/request";
import { uploadInitSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

/**
 * POST /api/documents/upload — step 1 of the upload flow.
 *
 * Vercel Functions cap request bodies at 4.5 MB, so file bytes go browser → PRIVATE
 * Vercel Blob directly using a short-lived token scoped to the path reserved here.
 * In local development without a Blob token, bytes go to /upload/local/:id instead.
 * The document only becomes visible after /upload/complete validates the stored bytes.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  assertMutationAllowed(req);
  const auth = await requireAuth(req);

  if (!isUploadStorageConfigured()) {
    console.error(`[securedocs] ${STORAGE_NOT_CONFIGURED_LOG}`);
    throw new HttpError(503, "Document uploads are not available: storage is not configured.");
  }

  const { uploads } = limits();
  const rl = await hitRateLimit(`upload:user:${auth.userId}`, uploads.limit, uploads.window);
  if (!rl.allowed) {
    await audit({ action: "RATE_LIMIT", userId: auth.userId, request: req, metadata: { route: "upload" } });
    throw tooManyRequests(rl);
  }

  const parsed = uploadInitSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "Only .pdf and .docx files are allowed.");

  const ticket = await createPendingUpload(auth, parsed.data);
  return jsonResponse(ticket, { status: 201 });
});
