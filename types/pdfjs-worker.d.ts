// pdfjs-dist ships no typings for its worker entry. Server code only imports it to make
// pdf.js run the worker on the main thread in Node (see lib/documents/pdf.ts).
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
