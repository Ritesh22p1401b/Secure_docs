import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// DEVELOPMENT-ONLY private storage on the local filesystem, used when no Vercel Blob
// credential is configured. Never used in production or on Vercel (see storageDriver()).
// Files live outside /public (never web-served) and are only read by server code after
// the same authorisation checks as Vercel Blob objects.

// Statically scoped so the production bundler's file tracing does not pull in the whole
// project. This driver never runs in production, so nothing here needs to be traced.
const DEFAULT_ROOT = path.join(process.cwd(), ".local-storage");

export function localStorageRoot(): string {
  const override = process.env.LOCAL_STORAGE_DIR; // tests only
  return override ? path.resolve(/*turbopackIgnore: true*/ override) : DEFAULT_ROOT;
}

const KEY_PATTERN = /^documents\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/;

/** Maps a server-generated storage key to a path, refusing anything outside the root. */
export function localPathFor(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
  const root = localStorageRoot();
  const full = path.resolve(root, ...key.split("/"));
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}

async function sizeOf(file: string): Promise<number | null> {
  try {
    const s = await stat(file);
    return s.isFile() ? s.size : null;
  } catch {
    return null;
  }
}

export async function localExists(key: string): Promise<boolean> {
  return (await sizeOf(localPathFor(key))) !== null;
}

export class LocalObjectExistsError extends Error {
  constructor() {
    super("Object already exists");
    this.name = "LocalObjectExistsError";
  }
}

export class LocalObjectTooLargeError extends Error {
  constructor() {
    super("Object exceeds the allowed size");
    this.name = "LocalObjectTooLargeError";
  }
}

/** Streams a request body to disk with a hard byte cap. Never overwrites. */
export async function writeLocalObject(
  key: string,
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<number> {
  const file = localPathFor(key);
  await mkdir(path.dirname(file), { recursive: true });
  let total = 0;
  const limiter = async function* (source: AsyncIterable<Uint8Array>) {
    for await (const chunk of source) {
      total += chunk.byteLength;
      if (total > maxBytes) throw new LocalObjectTooLargeError();
      yield chunk;
    }
  };
  try {
    await pipeline(
      Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>),
      limiter,
      createWriteStream(file, { flags: "wx" }), // "wx": fail if it already exists
    );
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "EEXIST") throw new LocalObjectExistsError();
    await rm(file, { force: true });
    throw err;
  }
  return total;
}

export async function readLocalObject(
  key: string,
  range?: { start: number; end: number },
): Promise<{ stream: ReadableStream<Uint8Array>; size: number; length: number } | null> {
  const file = localPathFor(key);
  const size = await sizeOf(file);
  if (size === null) return null;
  const node = range ? createReadStream(file, { start: range.start, end: range.end }) : createReadStream(file);
  const length = range ? range.end - range.start + 1 : size;
  return { stream: Readable.toWeb(node) as ReadableStream<Uint8Array>, size, length };
}

export async function readLocalObjectBytes(key: string): Promise<{ bytes: Uint8Array; size: number } | null> {
  const file = localPathFor(key);
  const size = await sizeOf(file);
  if (size === null) return null;
  return { bytes: new Uint8Array(await readFile(file)), size };
}

export async function sizeOfLocalObject(key: string): Promise<number | null> {
  return sizeOf(localPathFor(key));
}

export async function deleteLocalObject(key: string): Promise<void> {
  await rm(localPathFor(key), { force: true });
}
