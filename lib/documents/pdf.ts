import "server-only";
import { logServerError } from "@/lib/security/request";

export const PDF_MIME = "application/pdf";
export const MAX_PDF_PAGES = 5000;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export function hasPdfSignature(bytes: Uint8Array): boolean {
  return PDF_MAGIC.every((b, i) => bytes[i] === b);
}

function hasEofMarker(bytes: Uint8Array): boolean {
  const tail = new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.length - 2048)));
  return tail.includes("%%EOF");
}

export type PdfValidation = { ok: true; pages: number } | { ok: false; reason: string };

/**
 * In Node, pdf.js runs its worker on the main thread and loads it with
 * `import(GlobalWorkerOptions.workerSrc)` — a dynamic path that deployment file tracing
 * cannot follow, so pdf.worker.mjs would be missing on Vercel. Importing it statically
 * (traced) and exposing it as `globalThis.pdfjsWorker` makes pdf.js use it directly.
 */
async function loadPdfjs() {
  const g = globalThis as typeof globalThis & { pdfjsWorker?: unknown };
  if (!g.pdfjsWorker) g.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

/**
 * Validates a PDF by signature and by actually parsing it with pdf.js (no rendering,
 * no script execution, no XFA). Encrypted/password-protected PDFs are rejected because
 * the viewer cannot display them without collecting a password.
 */
export async function validatePdf(bytes: Uint8Array): Promise<PdfValidation> {
  if (!hasPdfSignature(bytes)) return { ok: false, reason: "File is not a valid PDF." };
  if (!hasEofMarker(bytes)) return { ok: false, reason: "PDF file appears to be truncated or malformed." };

  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: bytes.slice(), // pdf.js takes ownership (transfers) the buffer
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: true,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const pages = doc.numPages;
    if (pages < 1) return { ok: false, reason: "PDF has no pages." };
    if (pages > MAX_PDF_PAGES) return { ok: false, reason: "PDF has too many pages." };
    return { ok: true, pages };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "PasswordException") {
      return { ok: false, reason: "Password-protected PDFs are not supported." };
    }
    if (name !== "InvalidPDFException") logServerError("PDF validation failed", err);
    return { ok: false, reason: "PDF file is malformed and cannot be opened." };
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
