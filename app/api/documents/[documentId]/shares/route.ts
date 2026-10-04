import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { listShares, shareDocument } from "@/lib/documents/sharing";
import { audit } from "@/lib/security/audit";
import { hitRateLimit, limits, tooManyRequests } from "@/lib/security/rate-limit";
import {
  HttpError,
  assertMutationAllowed,
  jsonResponse,
  readJson,
  withErrorHandling,
} from "@/lib/security/request";
import { shareCreateSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ documentId: string }> };

/** GET /api/documents/:id/shares — owner only: who can view this document. */
export const GET = withErrorHandling(async (req: NextRequest, { params }: Ctx) => {
  const auth = await requireAuth(req);
  const { documentId } = await params;
  return jsonResponse({ shares: await listShares(auth, documentId) });
});

/** POST /api/documents/:id/shares { email } — owner only: grant view access to a registered user. */
export const POST = withErrorHandling(async (req: NextRequest, { params }: Ctx) => {
  assertMutationAllowed(req);
  const auth = await requireAuth(req);
  const { documentId } = await params;

  // Also bounds probing which emails have accounts.
  const { shares } = limits();
  const rl = await hitRateLimit(`share:user:${auth.userId}`, shares.limit, shares.window);
  if (!rl.allowed) {
    await audit({ action: "RATE_LIMIT", userId: auth.userId, request: req, metadata: { route: "share" } });
    throw tooManyRequests(rl);
  }

  const parsed = shareCreateSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "Enter a valid email address.");

  const share = await shareDocument(auth, documentId, parsed.data.email, req);
  return jsonResponse({ share }, { status: 201 });
});
