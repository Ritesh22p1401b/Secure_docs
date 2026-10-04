import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { completeUpload } from "@/lib/documents/service";
import {
  HttpError,
  assertMutationAllowed,
  jsonResponse,
  readJson,
  withErrorHandling,
} from "@/lib/security/request";
import { uploadCompleteSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/documents/upload/complete — validate stored bytes and create the Document. */
export const POST = withErrorHandling(async (req: NextRequest) => {
  assertMutationAllowed(req);
  const auth = await requireAuth(req);

  const parsed = uploadCompleteSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "Invalid upload.");

  const { document, duplicateOf } = await completeUpload(auth, parsed.data.uploadId, req);
  return jsonResponse(
    {
      document,
      ...(duplicateOf ? { notice: "A similar document already exists." } : {}),
    },
    { status: 201 },
  );
});
