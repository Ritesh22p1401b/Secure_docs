import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { AuthContext } from "@/lib/auth/session";
import { requireDocumentOwner } from "@/lib/auth/authorization";
import { audit } from "@/lib/security/audit";
import { HttpError, logServerError } from "@/lib/security/request";
import {
  StorageLimitExceededError,
  deletePrivateObject,
  isPrivateObject,
  readPrivateObjectBytes,
  storageDriver,
  storageKeyFor,
  type StorageDriver,
} from "@/lib/storage/blob";
import { LocalObjectExistsError, LocalObjectTooLargeError, writeLocalObject } from "@/lib/storage/local";
import { uploadCompleteSchema, type AllowedMimeType } from "@/lib/validation/schemas";
import { toDocumentDTO, type DocumentDTO } from "./metadata";
import {
  maxDocumentBytes,
  sanitizeDisplayName,
  validateDeclaredUpload,
  validateDocumentBytes,
} from "./validation";

export const PENDING_UPLOAD_TTL_MS = 15 * 60 * 1000;
/** Uploads started before expiry may finish later (multipart); cleanup waits this long past expiry. */
export const PENDING_COMPLETE_GRACE_MS = 60 * 60 * 1000;

export interface UploadTicket {
  uploadId: string;
  pathname: string;
  maxBytes: number;
  /** "vercel": browser uploads to private Blob · "local": browser PUTs to /upload/local/:id (dev only). */
  uploadMode: StorageDriver;
}

/** Step 1: validate the declared file and reserve a server-generated storage key. */
export async function createPendingUpload(
  auth: AuthContext,
  input: { name: string; size: number; mimeType: string },
): Promise<UploadTicket> {
  const declared = validateDeclaredUpload(input);
  if (!declared.ok) throw new HttpError(400, declared.reason);

  const id = randomUUID();
  const storageKey = storageKeyFor(auth.userId, id);
  await prisma.pendingUpload.create({
    data: {
      id,
      userId: auth.userId,
      storageKey,
      originalName: sanitizeDisplayName(input.name),
      mimeType: declared.mimeType,
      declaredSize: BigInt(input.size),
      expiresAt: new Date(Date.now() + PENDING_UPLOAD_TTL_MS),
    },
  });
  const uploadMode = storageDriver();
  if (!uploadMode) throw new HttpError(503, "Document uploads are not available: storage is not configured.");
  return { uploadId: id, pathname: storageKey, maxBytes: maxDocumentBytes(), uploadMode };
}

/**
 * Step 2 (local development driver only): receive the bytes for a reserved upload.
 * Same ownership/expiry rules as the Vercel token exchange; size-capped; never overwrites.
 * The bytes are validated afterwards by completeUpload(), exactly like Blob uploads.
 */
export async function receiveLocalUpload(
  auth: AuthContext,
  uploadId: string,
  body: ReadableStream<Uint8Array> | null,
  declaredLength: number,
): Promise<void> {
  if (storageDriver() !== "local") throw new HttpError(404, "Not found.");
  if (!uploadCompleteSchema.shape.uploadId.safeParse(uploadId).success) throw new HttpError(404, "Not found.");
  const pending = await prisma.pendingUpload.findFirst({
    where: { id: uploadId, userId: auth.userId, expiresAt: { gt: new Date() } },
  });
  if (!pending) throw new HttpError(404, "Not found.");
  const max = maxDocumentBytes();
  if (!body || declaredLength <= 0) throw new HttpError(400, "File is empty.");
  if (declaredLength > max) throw new HttpError(413, "File is too large.");
  try {
    await writeLocalObject(pending.storageKey, body, max);
  } catch (err) {
    if (err instanceof LocalObjectTooLargeError) throw new HttpError(413, "File is too large.");
    if (err instanceof LocalObjectExistsError) throw new HttpError(409, "This upload was already received.");
    throw err;
  }
}

/**
 * Step 2 (Vercel Blob token exchange): only issue a client token for a pathname
 * this user reserved, that has not expired. The token is scoped to that one path,
 * the declared MIME type and the size limit.
 */
export async function authorizeClientUpload(auth: AuthContext, pathname: string, uploadId: string | null) {
  if (!uploadId || !uploadCompleteSchema.shape.uploadId.safeParse(uploadId).success) {
    throw new HttpError(400, "Invalid upload.");
  }
  const pending = await prisma.pendingUpload.findFirst({
    where: { id: uploadId, userId: auth.userId, storageKey: pathname, expiresAt: { gt: new Date() } },
  });
  if (!pending) throw new HttpError(400, "Invalid upload.");
  return {
    allowedContentTypes: [pending.mimeType],
    maximumSizeInBytes: maxDocumentBytes(),
    validUntil: pending.expiresAt.getTime(),
    addRandomSuffix: false,
    allowOverwrite: false,
  };
}

async function discardUpload(pendingId: string, storageKey: string) {
  try {
    await deletePrivateObject(storageKey);
  } catch (err) {
    // The cleanup cron retries via the remaining PendingUpload row.
    logServerError("Failed to delete rejected upload", err);
    return;
  }
  await prisma.pendingUpload.deleteMany({ where: { id: pendingId } });
}

/**
 * Step 3: validate the bytes that were actually stored, then create the Document.
 * Nothing becomes viewable until it has passed server-side validation.
 */
export async function completeUpload(
  auth: AuthContext,
  uploadId: string,
  req: Request,
): Promise<{ document: DocumentDTO; duplicateOf: string | null }> {
  const pending = await prisma.pendingUpload.findFirst({
    where: {
      id: uploadId,
      userId: auth.userId,
      expiresAt: { gt: new Date(Date.now() - PENDING_COMPLETE_GRACE_MS) },
    },
  });
  if (!pending) throw new HttpError(404, "Upload not found.");

  const reject = async (reason: string, code: string) => {
    await discardUpload(pending.id, pending.storageKey);
    await audit({
      action: "DOCUMENT_UPLOAD_REJECTED",
      userId: auth.userId,
      request: req,
      metadata: { reason: code },
    });
    return new HttpError(400, reason);
  };

  if (!(await isPrivateObject(pending.storageKey))) {
    throw await reject("Upload could not be verified. Please try again.", "not_private_or_missing");
  }

  let bytes: Uint8Array | null;
  try {
    bytes = await readPrivateObjectBytes(pending.storageKey, maxDocumentBytes());
  } catch (err) {
    if (err instanceof StorageLimitExceededError) throw await reject("File is too large.", "too_large");
    throw err;
  }
  if (!bytes) throw await reject("Upload could not be verified. Please try again.", "missing");

  const check = await validateDocumentBytes(bytes, pending.mimeType as AllowedMimeType);
  if (!check.ok) throw await reject(check.reason, "invalid_content");

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const duplicate = await prisma.document.findFirst({
    where: { ownerId: auth.userId, sha256 },
    select: { id: true },
  });

  let created;
  try {
    [created] = await prisma.$transaction([
      prisma.document.create({
        data: {
          id: pending.id,
          ownerId: auth.userId,
          originalName: pending.originalName,
          storageKey: pending.storageKey,
          mimeType: pending.mimeType,
          sizeBytes: BigInt(bytes.byteLength),
          sha256,
        },
      }),
      prisma.pendingUpload.delete({ where: { id: pending.id } }),
    ]);
  } catch (err) {
    // A concurrent /complete for the same upload may have won: its Document now owns
    // the stored object, so it must NOT be deleted here.
    const alreadyCreated = await prisma.document.count({ where: { id: pending.id, ownerId: auth.userId } });
    if (alreadyCreated) throw new HttpError(409, "This upload has already been completed.");
    // DB failed after the bytes were stored: do not leave an orphaned confidential object.
    logServerError("Document record creation failed", err);
    await discardUpload(pending.id, pending.storageKey);
    throw new HttpError(500, "Upload failed. Please try again.");
  }

  await audit({
    action: "DOCUMENT_UPLOAD",
    userId: auth.userId,
    documentId: created.id,
    request: req,
    metadata: { mimeType: created.mimeType, sizeBytes: bytes.byteLength },
  });

  return { document: toDocumentDTO(created), duplicateOf: duplicate?.id ?? null };
}

/**
 * Delete: storage first, then metadata. If storage deletion fails the record is kept
 * so the user can retry (no unreachable-but-existing confidential object).
 */
export async function deleteDocument(auth: AuthContext, documentId: string, req: Request): Promise<void> {
  const doc = await requireDocumentOwner(auth, documentId); // recipients of a share cannot delete
  try {
    await deletePrivateObject(doc.storageKey);
  } catch (err) {
    logServerError("Storage delete failed", err);
    await audit({ action: "STORAGE_ERROR", userId: auth.userId, documentId: doc.id, request: req, metadata: { op: "delete" } });
    throw new HttpError(503, "Unable to delete the document right now. Please try again.");
  }
  await prisma.document.deleteMany({ where: { id: doc.id, ownerId: auth.userId } });
  await audit({ action: "DOCUMENT_DELETE", userId: auth.userId, documentId: doc.id, request: req });
}
