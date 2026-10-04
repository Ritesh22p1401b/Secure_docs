import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { revokeShare } from "@/lib/documents/sharing";
import { assertMutationAllowed, jsonResponse, withErrorHandling } from "@/lib/security/request";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ documentId: string; shareId: string }> };

/** DELETE /api/documents/:id/shares/:shareId — owner only: revoke a user's access. */
export const DELETE = withErrorHandling(async (req: NextRequest, { params }: Ctx) => {
  assertMutationAllowed(req);
  const auth = await requireAuth(req);
  const { documentId, shareId } = await params;
  await revokeShare(auth, documentId, shareId, req);
  return jsonResponse({ success: true });
});
