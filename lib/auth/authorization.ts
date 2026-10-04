import "server-only";
import { prisma } from "@/lib/db/prisma";
import { HttpError, NOT_FOUND } from "@/lib/security/request";
import { documentIdSchema } from "@/lib/validation/schemas";
import type { AuthContext } from "./session";

export interface AuthorizedDocument {
  id: string;
  ownerId: string;
  originalName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: bigint;
  sha256: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DocumentAccess = "owner" | "shared";

export interface ViewableDocument extends AuthorizedDocument {
  access: DocumentAccess;
  ownerEmail: string;
}

// The authorisation gates for document access. Identity always comes from the
// server-side session — never from client input. Malformed IDs, documents the user
// may not access and missing documents are indistinguishable (404).

/** OWNER-only (delete, manage shares). */
export async function findAuthorizedDocument(
  auth: AuthContext,
  documentId: string,
): Promise<AuthorizedDocument | null> {
  const parsed = documentIdSchema.safeParse(documentId);
  if (!parsed.success) return null;
  return prisma.document.findFirst({
    where: { id: parsed.data, ownerId: auth.userId },
  });
}

export async function requireDocumentOwner(
  auth: AuthContext,
  documentId: string,
): Promise<AuthorizedDocument> {
  const doc = await findAuthorizedDocument(auth, documentId);
  if (!doc) throw new HttpError(404, NOT_FOUND);
  return doc;
}

/** VIEW access: the owner, or a user the owner explicitly shared the document with. */
export async function findViewableDocument(
  auth: AuthContext,
  documentId: string,
): Promise<ViewableDocument | null> {
  const parsed = documentIdSchema.safeParse(documentId);
  if (!parsed.success) return null;
  const doc = await prisma.document.findFirst({
    where: {
      id: parsed.data,
      OR: [{ ownerId: auth.userId }, { shares: { some: { recipientId: auth.userId } } }],
    },
    include: { owner: { select: { email: true } } },
  });
  if (!doc) return null;
  const { owner, ...rest } = doc;
  return { ...rest, ownerEmail: owner.email, access: doc.ownerId === auth.userId ? "owner" : "shared" };
}

export async function requireViewAccess(auth: AuthContext, documentId: string): Promise<ViewableDocument> {
  const doc = await findViewableDocument(auth, documentId);
  if (!doc) throw new HttpError(404, NOT_FOUND);
  return doc;
}
