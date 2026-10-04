import "server-only";

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
 * Validates a PDF by signature and by actually parsing it with pdf.js (no rendering,
 * no script execution, no XFA). Encrypted/password-protected PDFs are rejected because
 * the viewer cannot display them without collecting a password.
 */
export async function validatePdf(bytes: Uint8Array): Promise<PdfValidation> {
  if (!hasPdfSignature(bytes)) return { ok: false, reason: "File is not a valid PDF." };
  if (!hasEofMarker(bytes)) return { ok: false, reason: "PDF file appears to be truncated or malformed." };

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
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
    return { ok: false, reason: "PDF file is malformed and cannot be opened." };
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
