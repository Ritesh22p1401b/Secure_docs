import type { NextRequest } from "next/server";
import { requireViewAccess } from "@/lib/auth/authorization";
import { requireAuth } from "@/lib/auth/session";
import { audit } from "@/lib/security/audit";
import { hitRateLimit, limits, tooManyRequests } from "@/lib/security/rate-limit";
import {
  HttpError,
  assertMutationAllowed,
  jsonResponse,
  readJson,
  withErrorHandling,
} from "@/lib/security/request";
import { viewerEventSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ documentId: string }> };

/**
 * POST /api/documents/:id/events { type } — records viewer deterrent events (window lost
 * focus, Print Screen / capture shortcut pressed) in the audit log. Client-reported and
 * therefore only an indicator; it is never used for access decisions.
 */
export const POST = withErrorHandling(async (req: NextRequest, { params }: Ctx) => {
  assertMutationAllowed(req);
  const auth = await requireAuth(req);
  const { documentId } = await params;

  const { viewerEvents } = limits();
  const rl = await hitRateLimit(`viewer-events:user:${auth.userId}`, viewerEvents.limit, viewerEvents.window);
  if (!rl.allowed) throw tooManyRequests(rl); // not audited: that would defeat the limit

  const parsed = viewerEventSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "Invalid request.");

  const doc = await requireViewAccess(auth, documentId); // same 404 as missing for others
  const { type } = parsed.data;
  await audit({
    action: type === "focus_lost" ? "VIEWER_FOCUS_LOST" : "SCREEN_CAPTURE_SUSPECTED",
    userId: auth.userId,
    documentId: doc.id,
    request: req,
    metadata: { trigger: type, access: doc.access },
  });
  return jsonResponse({ ok: true });
});
