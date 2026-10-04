import "server-only";
import JSZip from "jszip";
import mammoth from "mammoth";
import sanitizeHtml from "sanitize-html";
import { ZipFormatError, isZipSignature, readCentralDirectory, type ZipEntry } from "./zip";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const MAIN_DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";

const MAX_ENTRIES = 5000;
const MAX_TOTAL_UNCOMPRESSED = 256 * 1024 * 1024; // 256 MiB
const MAX_ENTRY_RATIO = 200; // compression ratio above which a large entry is treated as a zip bomb
const RATIO_CHECK_MIN_BYTES = 10 * 1024 * 1024;

export type DocxValidation = { ok: true } | { ok: false; reason: string };

function isUnsafeEntryName(name: string) {
  return name.startsWith("/") || name.includes("\\") || name.split("/").includes("..") || name.includes("\0");
}

function isMacroOrActiveContent(name: string) {
  const lower = name.toLowerCase();
  return (
    lower.endsWith("vbaproject.bin") ||
    lower.endsWith("vbadata.xml") ||
    lower.includes("/activex/") ||
    (lower.endsWith(".bin") && lower.includes("vba"))
  );
}

function checkEntries(entries: ZipEntry[]): DocxValidation {
  let total = 0;
  for (const e of entries) {
    if (isUnsafeEntryName(e.name)) return { ok: false, reason: "Document package contains invalid paths." };
    if (e.flags & 0x1) return { ok: false, reason: "Encrypted documents are not supported." };
    if (isMacroOrActiveContent(e.name)) {
      return { ok: false, reason: "Macro-enabled or active-content documents are not supported." };
    }
    total += e.uncompressedSize;
    if (
      e.uncompressedSize > RATIO_CHECK_MIN_BYTES &&
      e.uncompressedSize / Math.max(1, e.compressedSize) > MAX_ENTRY_RATIO
    ) {
      return { ok: false, reason: "Document package is malformed." };
    }
  }
  if (total > MAX_TOTAL_UNCOMPRESSED) return { ok: false, reason: "Document package is too large." };
  return { ok: true };
}

/**
 * Verifies a genuine Office Open XML word-processing document — not merely a file
 * named `.docx`. Rejects macro-enabled (.docm), templates, encrypted packages,
 * zip bombs, and anything that is not a well-formed package.
 */
export async function validateDocx(bytes: Uint8Array): Promise<DocxValidation> {
  if (!isZipSignature(bytes)) return { ok: false, reason: "File is not a valid DOCX document." };

  let entries: ZipEntry[];
  try {
    entries = readCentralDirectory(bytes, MAX_ENTRIES);
  } catch (err) {
    if (err instanceof ZipFormatError) return { ok: false, reason: "DOCX file is malformed." };
    throw err;
  }
  const entryCheck = checkEntries(entries);
  if (!entryCheck.ok) return entryCheck;

  const names = new Set(entries.map((e) => e.name));
  if (!names.has("[Content_Types].xml") || !names.has("_rels/.rels")) {
    return { ok: false, reason: "File is not a valid DOCX document." };
  }

  try {
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    const contentTypes = await zip.file("[Content_Types].xml")?.async("string");
    if (!contentTypes) return { ok: false, reason: "File is not a valid DOCX document." };
    if (/macroEnabled/i.test(contentTypes)) {
      return { ok: false, reason: "Macro-enabled documents are not supported." };
    }
    if (!contentTypes.includes(MAIN_DOCX_CONTENT_TYPE)) {
      return { ok: false, reason: "File is not a valid DOCX document." };
    }
    const main = /PartName="\/([^"]+)"\s+ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml"/.exec(
      contentTypes,
    );
    const mainPath = main?.[1] ?? "word/document.xml";
    const mainXml = await zip.file(mainPath)?.async("string");
    if (!mainXml || !mainXml.includes("<w:document")) {
      return { ok: false, reason: "DOCX file is malformed." };
    }
  } catch {
    return { ok: false, reason: "DOCX file is malformed." };
  }
  return { ok: true };
}

const SAFE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/bmp", "image/webp"]);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 3 * 1024 * 1024; // keeps the HTML response small

const SAFE_DATA_IMAGE = /^data:image\/(png|jpeg|gif|bmp|webp);base64,[a-z0-9+/=]+$/i;

/** Strict allowlist. Everything else (script, iframe, object, embed, style, event handlers…) is removed. */
export const DOCX_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "blockquote", "pre", "code",
    "strong", "b", "em", "i", "u", "s", "sub", "sup", "span",
    "ul", "ol", "li",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
    "a", "img",
  ],
  allowedAttributes: {
    a: ["href", "rel", "target"], // rel/target are only ever set by transformTags below
    img: ["src", "alt"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
    ol: ["start"],
  },
  allowedSchemes: ["https", "http", "mailto"],
  allowedSchemesByTag: { img: ["data"] },
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed", "template"],
  transformTags: {
    a: (_tagName, attribs): sanitizeHtml.Tag => {
      const href = attribs.href ?? "";
      // Internal anchors (#footnote-1) would need element ids, which we strip to avoid DOM clobbering.
      if (!/^(https?:|mailto:)/i.test(href)) return { tagName: "span", attribs: {} };
      return { tagName: "a", attribs: { href, rel: "noopener noreferrer nofollow", target: "_blank" } };
    },
  },
  exclusiveFilter: (frame) => frame.tag === "img" && !SAFE_DATA_IMAGE.test(frame.attribs.src ?? ""),
};

export function sanitizeDocxHtml(html: string): string {
  return sanitizeHtml(html, DOCX_SANITIZE_OPTIONS);
}

export interface DocxRenderResult {
  html: string;
  omittedImages: number;
}

/** DOCX → HTML (mammoth) → strict sanitisation. The original file never reaches the browser. */
export async function convertDocxToSafeHtml(bytes: Uint8Array): Promise<DocxRenderResult> {
  let imageBytes = 0;
  let omittedImages = 0;

  const result = await mammoth.convertToHtml(
    { buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) },
    {
      ignoreEmptyParagraphs: false,
      // Never let a document make the server read local files or fetch URLs (LFI/SSRF).
      externalFileAccess: false,
      convertImage: mammoth.images.imgElement(async (image) => {
        const type = (image.contentType ?? "").toLowerCase();
        if (!SAFE_IMAGE_TYPES.has(type)) {
          omittedImages++;
          return { src: "" };
        }
        const data = await image.readAsBase64String();
        const size = Math.floor((data.length * 3) / 4);
        if (size > MAX_IMAGE_BYTES || imageBytes + size > MAX_TOTAL_IMAGE_BYTES) {
          omittedImages++;
          return { src: "" };
        }
        imageBytes += size;
        return { src: `data:${type};base64,${data}` };
      }),
    },
  );

  return { html: sanitizeDocxHtml(result.value), omittedImages };
}
