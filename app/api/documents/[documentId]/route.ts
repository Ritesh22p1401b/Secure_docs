import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { requireViewAccess } from "@/lib/auth/authorization";
import { toDocumentDTO } from "@/lib/documents/metadata";
import { deleteDocument } from "@/lib/documents/service";
import { audit } from "@/lib/security/audit";
import { enforceRateLimit, limits } from "@/lib/security/rate-limit";
import { assertMutationAllowed, jsonResponse, withErrorHandling } from "@/lib/security/request";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ documentId: string }> };

/** GET /api/documents/:id — metadata only. */
export const GET = withErrorHandling(async (req: NextRequest, { params }: Ctx) => {
  const auth = await requireAuth(req);
  const { documentId } = await params;
  const doc = await requireViewAccess(auth, documentId);
  return jsonResponse({
    document: toDocumentDTO(doc, doc.access === "shared" ? { ownerEmail: doc.ownerEmail } : undefined),
  });
});

/** DELETE /api/documents/:id — owner only. */
export const DELETE = withErrorHandling(async (req: NextRequest, { params }: Ctx) => {
  assertMutationAllowed(req);
  const auth = await requireAuth(req);
  const { documentId } = await params;
  const { delete: del } = limits();
  try {
    await enforceRateLimit(`delete:user:${auth.userId}`, del.limit, del.window);
  } catch (err) {
    await audit({ action: "RATE_LIMIT", userId: auth.userId, request: req, metadata: { route: "delete" } });
    throw err;
  }
  await deleteDocument(auth, documentId, req);
  return jsonResponse({ success: true });
});
