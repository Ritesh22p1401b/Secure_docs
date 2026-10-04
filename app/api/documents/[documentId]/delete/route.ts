import { DELETE } from "../route";

export const runtime = "nodejs";

/** POST /api/documents/:id/delete — alias of DELETE /api/documents/:id (same checks). */
export const POST = DELETE;
