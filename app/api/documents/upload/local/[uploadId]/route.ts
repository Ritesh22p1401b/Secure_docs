import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { receiveLocalUpload } from "@/lib/documents/service";
import { assertMutationAllowed, jsonResponse, withErrorHandling } from "@/lib/security/request";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ uploadId: string }> };

/**
 * PUT /api/documents/upload/local/:uploadId — DEVELOPMENT-ONLY byte upload used when no
 * Vercel Blob credential is configured. Returns 404 whenever the local driver is not
 * active (always the case in production / on Vercel). The bytes are validated by
 * /upload/complete before a document is created.
 */
export const PUT = withErrorHandling(async (req: NextRequest, { params }: Ctx) => {
  assertMutationAllowed(req);
  const auth = await requireAuth(req);
  const { uploadId } = await params;
  const length = Number(req.headers.get("content-length") ?? "0");
  await receiveLocalUpload(auth, uploadId, req.body, Number.isFinite(length) ? length : 0);
  return jsonResponse({ success: true }, { status: 201 });
});
