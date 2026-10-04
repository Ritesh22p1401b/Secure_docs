import "server-only";
import { env } from "@/lib/env";
import type { AllowedMimeType } from "@/lib/validation/schemas";
import { DOCX_MIME, validateDocx } from "./docx";
import { PDF_MIME, hasPdfSignature, validatePdf } from "./pdf";
import { isZipSignature } from "./zip";

export const EXTENSION_MIME: Record<string, AllowedMimeType> = {
  ".pdf": PDF_MIME,
  ".docx": DOCX_MIME,
};

export function maxDocumentBytes(): number {
  return env().MAX_DOCUMENT_SIZE_MB * 1024 * 1024;
}

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
}

/**
 * Display-only filename. Strips any path component (../, C:\…), control and bidi
 * override characters. It is never used to build a storage path.
 */
export function sanitizeDisplayName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").normalize("NFC");
  const cleaned = base.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "").trim();
  return (cleaned || "document").slice(0, 255);
}

export type DeclaredCheck = { ok: true; mimeType: AllowedMimeType } | { ok: false; reason: string };

/** First gate (before any bytes are stored): extension, declared MIME, declared size. */
export function validateDeclaredUpload(input: { name: string; size: number; mimeType: string }): DeclaredCheck {
  const ext = extensionOf(input.name);
  const expected = EXTENSION_MIME[ext];
  if (!expected) return { ok: false, reason: "Only .pdf and .docx files are allowed." };
  if (input.mimeType !== expected) return { ok: false, reason: "File type does not match its extension." };
  if (input.size <= 0) return { ok: false, reason: "File is empty." };
  if (input.size > maxDocumentBytes()) {
    return { ok: false, reason: `File exceeds the ${env().MAX_DOCUMENT_SIZE_MB} MB limit.` };
  }
  return { ok: true, mimeType: expected };
}

export function sniffMimeType(bytes: Uint8Array): AllowedMimeType | null {
  if (hasPdfSignature(bytes)) return PDF_MIME;
  if (isZipSignature(bytes)) return DOCX_MIME; // confirmed by validateDocx
  return null;
}

export type ContentCheck = { ok: true } | { ok: false; reason: string };

/** Second gate (on the actual stored bytes): size, magic bytes, parsed structure. */
export async function validateDocumentBytes(bytes: Uint8Array, declared: AllowedMimeType): Promise<ContentCheck> {
  if (bytes.byteLength === 0) return { ok: false, reason: "File is empty." };
  if (bytes.byteLength > maxDocumentBytes()) return { ok: false, reason: "File is too large." };
  const sniffed = sniffMimeType(bytes);
  if (sniffed !== declared) return { ok: false, reason: "File content does not match its type." };
  return declared === PDF_MIME ? validatePdf(bytes) : validateDocx(bytes);
}
