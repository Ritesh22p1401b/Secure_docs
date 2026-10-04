import "server-only";
import { prisma } from "@/lib/db/prisma";
import { requireDocumentOwner } from "@/lib/auth/authorization";
import type { AuthContext } from "@/lib/auth/session";
import { audit } from "@/lib/security/audit";
import { HttpError, NOT_FOUND, type HeaderSource } from "@/lib/security/request";
import { shareIdSchema } from "@/lib/validation/schemas";

export const MAX_SHARES_PER_DOCUMENT = 50;

/** Recipient info returned to the OWNER only. */
export interface ShareDTO {
  id: string;
  email: string;
  createdAt: string;
}

function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}

export async function listShares(auth: AuthContext, documentId: string): Promise<ShareDTO[]> {
  const doc = await requireDocumentOwner(auth, documentId);
  const shares = await prisma.documentShare.findMany({
    where: { documentId: doc.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true, recipient: { select: { email: true } } },
  });
  return shares.map((s) => ({ id: s.id, email: s.recipient.email, createdAt: s.createdAt.toISOString() }));
}

/**
 * Grants view-only access to another REGISTERED user, identified by their login email.
 * Only the owner can share. Recipients cannot re-share, delete, or see other recipients.
 */
export async function shareDocument(
  auth: AuthContext,
  documentId: string,
  recipientEmail: string,
  req: HeaderSource,
): Promise<ShareDTO> {
  const doc = await requireDocumentOwner(auth, documentId);

  if (recipientEmail === auth.email) throw new HttpError(400, "You already own this document.");

  const recipient = await prisma.user.findUnique({ where: { email: recipientEmail }, select: { id: true, email: true } });
  if (!recipient) {
    // Sharing requires an existing account; there is no invite-by-email (signup does not verify
    // email ownership, so pre-granting access to an unregistered address would be unsafe).
    throw new HttpError(404, "No SecureDocs account uses that email address.");
  }

  const count = await prisma.documentShare.count({ where: { documentId: doc.id } });
  if (count >= MAX_SHARES_PER_DOCUMENT) {
    throw new HttpError(400, `A document can be shared with at most ${MAX_SHARES_PER_DOCUMENT} users.`);
  }

  try {
    const share = await prisma.documentShare.create({
      data: { documentId: doc.id, recipientId: recipient.id, sharedById: auth.userId },
      select: { id: true, createdAt: true },
    });
    await audit({
      action: "DOCUMENT_SHARE",
      userId: auth.userId,
      documentId: doc.id,
      request: req,
      metadata: { recipientId: recipient.id },
    });
    return { id: share.id, email: recipient.email, createdAt: share.createdAt.toISOString() };
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, "This document is already shared with that user.");
    throw err;
  }
}

/** Revocation takes effect immediately: every view request re-checks the share row. */
export async function revokeShare(
  auth: AuthContext,
  documentId: string,
  shareId: string,
  req: HeaderSource,
): Promise<void> {
  const doc = await requireDocumentOwner(auth, documentId);
  if (!shareIdSchema.safeParse(shareId).success) throw new HttpError(404, NOT_FOUND);
  const share = await prisma.documentShare.findFirst({
    where: { id: shareId, documentId: doc.id },
    select: { id: true, recipientId: true },
  });
  if (!share) throw new HttpError(404, NOT_FOUND);
  await prisma.documentShare.delete({ where: { id: share.id } });
  await audit({
    action: "DOCUMENT_UNSHARE",
    userId: auth.userId,
    documentId: doc.id,
    request: req,
    metadata: { recipientId: share.recipientId },
  });
}
