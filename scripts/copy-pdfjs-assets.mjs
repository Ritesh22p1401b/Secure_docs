// Copies the pdf.js worker and its static resources (fonts, cmaps, wasm decoders)
// into public/pdfjs so they are served same-origin under a strict CSP.
// These are library assets only — confidential documents are NEVER stored in /public.
// Idempotent: skipped when the installed pdf.js version is already in place, so it
// never rewrites files a running dev server may be reading.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve("pdfjs-dist/package.json");
const pdfjsRoot = dirname(pkgPath);
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));
const target = join(process.cwd(), "public", "pdfjs");
const marker = join(target, ".version");

if (existsSync(marker) && readFileSync(marker, "utf8").trim() === version) {
  console.log(`pdf.js ${version} assets already present`);
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(join(pdfjsRoot, "build", "pdf.worker.min.mjs"), join(target, "pdf.worker.min.mjs"));
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  const src = join(pdfjsRoot, dir);
  if (!existsSync(src)) continue;
  // The PDF JavaScript sandbox (quickjs) is never used: scripting stays disabled.
  cpSync(src, join(target, dir), { recursive: true, filter: (f) => !/quickjs/i.test(f) });
}
writeFileSync(marker, version);
console.log(`pdf.js ${version} assets copied to public/pdfjs`);
