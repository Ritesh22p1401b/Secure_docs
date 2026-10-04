import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { PENDING_COMPLETE_GRACE_MS } from "@/lib/documents/service";
import { deletePrivateObject } from "@/lib/storage/blob";
import { errorResponse, jsonResponse, logServerError, withErrorHandling } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * GET /api/cron/cleanup — invoked by Vercel Cron (see vercel.json) with CRON_SECRET.
 * Removes abandoned uploads (and their private objects), dead sessions and stale
 * rate-limit counters so confidential bytes are not left orphaned.
 */
export const GET = withErrorHandling(async (req: Request) => {
  if (!authorized(req)) return errorResponse(404, "Not found.");

  const now = new Date();
  const expired = await prisma.pendingUpload.findMany({
    // Past expiry AND the completion grace window, so in-flight completions are never raced.
    where: { expiresAt: { lt: new Date(now.getTime() - PENDING_COMPLETE_GRACE_MS) } },
    select: { id: true, storageKey: true },
    take: 200,
  });

  let removedUploads = 0;
  for (const p of expired) {
    try {
      await deletePrivateObject(p.storageKey);
      await prisma.pendingUpload.delete({ where: { id: p.id } });
      removedUploads++;
    } catch (err) {
      logServerError("Orphan cleanup failed for one upload", err);
    }
  }

  const sessions = await prisma.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: new Date(now.getTime() - 86_400_000) } }] },
  });
  const counters = await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: now } } });

  return jsonResponse({
    removedUploads,
    removedSessions: sessions.count,
    removedRateLimits: counters.count,
  });
});
