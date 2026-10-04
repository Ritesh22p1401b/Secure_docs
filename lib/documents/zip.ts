// Minimal, allocation-free reader for a ZIP central directory. Used to inspect an
// Office Open XML package *before* any decompression happens (zip-bomb, macro and
// encryption checks). It never extracts anything to disk.

export interface ZipEntry {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
}

export class ZipFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipFormatError";
  }
}

const EOCD_SIG = 0x06054b50;
const CDH_SIG = 0x02014b50;
const MAX_COMMENT = 0xffff;

export function isZipSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function readCentralDirectory(bytes: Uint8Array, maxEntries: number): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minEocd = 22;
  if (bytes.length < minEocd) throw new ZipFormatError("too small");

  let eocd = -1;
  const stop = Math.max(0, bytes.length - minEocd - MAX_COMMENT);
  for (let i = bytes.length - minEocd; i >= stop; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipFormatError("no end of central directory");

  const totalEntries = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new ZipFormatError("zip64 not supported");
  }
  if (totalEntries > maxEntries) throw new ZipFormatError("too many entries");
  if (cdOffset + cdSize > eocd) throw new ZipFormatError("central directory out of bounds");

  const decoder = new TextDecoder("utf-8", { fatal: false });
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let n = 0; n < totalEntries; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== CDH_SIG) {
      throw new ZipFormatError("bad central directory header");
    }
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const uncompressedSize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const nameEnd = p + 46 + nameLen;
    if (nameEnd > bytes.length) throw new ZipFormatError("bad entry name");
    const name = decoder.decode(bytes.subarray(p + 46, nameEnd));
    entries.push({ name, flags, method, compressedSize, uncompressedSize });
    p = nameEnd + extraLen + commentLen;
  }
  return entries;
}
