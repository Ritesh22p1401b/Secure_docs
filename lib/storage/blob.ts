import "server-only";
import { BlobNotFoundError, del, get, head } from "@vercel/blob";
import {
  deleteLocalObject,
  localExists,
  readLocalObject,
  readLocalObjectBytes,
  sizeOfLocalObject,
} from "./local";

// All document storage goes through this module. Objects are PRIVATE: they can only be
// read server-side. No storage URL ever leaves the server.
//
// Drivers:
//  - "vercel": Vercel Blob private store (BLOB_READ_WRITE_TOKEN; reads/deletes may also use
//    Vercel OIDC). Required in production.
//  - "local":  development-only filesystem store (lib/storage/local.ts), used automatically
//    when no Blob token is set and the app is NOT running in production or on Vercel.

export type StorageDriver = "vercel" | "local";

export function storageDriver(): StorageDriver | null {
  if (process.env.BLOB_READ_WRITE_TOKEN?.startsWith("vercel_blob_rw_")) return "vercel";
  const production = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  return production ? null : "local";
}

/** Checked up front so a misconfiguration produces a clear 503, not a failure mid-upload. */
export function isUploadStorageConfigured(): boolean {
  return storageDriver() !== null;
}

export const STORAGE_NOT_CONFIGURED_LOG =
  "Document storage is not configured: set BLOB_READ_WRITE_TOKEN (Vercel → Storage → Blob, a PRIVATE store).";

export const LOCAL_STORAGE_NOTICE =
  "No BLOB_READ_WRITE_TOKEN: using DEVELOPMENT-ONLY local storage in .local-storage/ (never used in production).";

/** Storage keys are generated from server-side IDs only — never from user filenames. */
export function storageKeyFor(userId: string, documentId: string): string {
  return `documents/${userId}/${documentId}`;
}

export class StorageLimitExceededError extends Error {
  constructor() {
    super("Stored object exceeds the allowed size");
    this.name = "StorageLimitExceededError";
  }
}

export interface StoredObjectStream {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  /** Present when the store honoured a byte-range request (e.g. "bytes 0-99/1234"). */
  contentRange: string | null;
  contentLength: number | null;
}

export async function readPrivateObject(
  key: string,
  range?: { start: number; end: number },
): Promise<StoredObjectStream | null> {
  if (storageDriver() === "local") {
    const obj = await readLocalObject(key, range);
    if (!obj) return null;
    return {
      stream: obj.stream,
      contentType: "application/octet-stream",
      contentRange: range ? `bytes ${range.start}-${range.end}/${obj.size}` : null,
      contentLength: obj.length,
    };
  }
  const result = await get(key, {
    access: "private",
    headers: range ? { range: `bytes=${range.start}-${range.end}` } : undefined,
  });
  if (!result || result.statusCode !== 200) return null;
  const len = result.headers.get("content-length");
  return {
    stream: result.stream,
    contentType: result.blob.contentType,
    contentRange: result.headers.get("content-range"),
    contentLength: len ? Number(len) : null,
  };
}

/** Reads a whole private object into memory, aborting once `maxBytes` is exceeded. */
export async function readPrivateObjectBytes(key: string, maxBytes: number): Promise<Uint8Array | null> {
  if (storageDriver() === "local") {
    const size = await sizeOfLocalObject(key);
    if (size === null) return null;
    if (size > maxBytes) throw new StorageLimitExceededError();
    return (await readLocalObjectBytes(key))?.bytes ?? null;
  }
  const obj = await readPrivateObject(key);
  if (!obj) return null;
  if (obj.contentLength !== null && obj.contentLength > maxBytes) {
    await obj.stream.cancel();
    throw new StorageLimitExceededError();
  }
  const reader = obj.stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new StorageLimitExceededError();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Defence in depth against a client that requests `access: "public"` with its upload
 * token: confirm the object lives on the private host. (The store itself must also be
 * created as a private store — see README.) Local objects are private by construction.
 */
export async function isPrivateObject(key: string): Promise<boolean> {
  if (storageDriver() === "local") return localExists(key);
  try {
    const meta = await head(key);
    return new URL(meta.url).hostname.endsWith(".private.blob.vercel-storage.com");
  } catch (err) {
    if (err instanceof BlobNotFoundError) return false;
    throw err;
  }
}

/** Idempotent: deleting a missing object succeeds. */
export async function deletePrivateObject(key: string): Promise<void> {
  if (storageDriver() === "local") return deleteLocalObject(key);
  await del(key);
}
