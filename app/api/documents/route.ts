import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { listDocuments } from "@/lib/documents/metadata";
import { HttpError, jsonResponse, withErrorHandling } from "@/lib/security/request";
import { listDocumentsQuerySchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

/** GET /api/documents?page=1&limit=20&q=contract&sort=newest — only the caller's documents. */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req);
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listDocumentsQuerySchema.safeParse(params);
  if (!parsed.success) throw new HttpError(400, "Invalid query parameters.");
  return jsonResponse(await listDocuments(auth, parsed.data));
});
