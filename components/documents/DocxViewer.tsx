"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { apiFetch, readErrorMessage } from "@/lib/client/api";
import { VIEWER_HEADER } from "@/lib/documents/constants";
import { SecurityWatermark } from "./SecurityWatermark";
import { ViewerToolbar } from "./ViewerToolbar";

/**
 * Displays a DOCX that the server has converted to HTML and sanitised with a strict
 * allowlist. The original .docx is never sent to the browser. The page CSP (nonce-only
 * scripts) is a second barrier should anything slip past sanitisation.
 */
export function DocxViewer({ documentId, watermarkLines }: { documentId: string; watermarkLines: string[] }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [omittedImages, setOmittedImages] = useState(0);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/documents/${encodeURIComponent(documentId)}/content`, {
          headers: { [VIEWER_HEADER]: "1" },
        });
        if (!res.ok) {
          if (!cancelled) setError(await readErrorMessage(res, "This document could not be displayed."));
          return;
        }
        const text = await res.text();
        if (cancelled) return;
        setOmittedImages(Number(res.headers.get("x-omitted-images") ?? "0") || 0);
        setHtml(text);
      } catch {
        if (!cancelled) setError("This document could not be displayed.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col">
      <div className="flex-1 overflow-auto bg-slate-200 px-2 py-4 sm:px-6">
        {!html && !error && (
          <div className="flex h-64 items-center justify-center text-slate-700">
            <Spinner size="lg" label="Loading secure document…" />
          </div>
        )}
        {error && (
          <div role="alert" className="mx-auto mt-16 max-w-md rounded-xl bg-white p-6 text-center text-sm text-red-800 shadow">
            {error}
          </div>
        )}
        {html !== null && (
          <article className="relative mx-auto max-w-4xl overflow-hidden rounded-sm bg-white px-6 py-8 shadow-lg sm:px-12 sm:py-12">
            {omittedImages > 0 && (
              <p className="relative z-20 mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
                {omittedImages} image{omittedImages === 1 ? " was" : "s were"} omitted because {omittedImages === 1 ? "it" : "they"} could
                not be displayed safely.
              </p>
            )}
            <div
              className="docx-content"
              style={{ fontSize: `${zoom}%` }}
              // Sanitised server-side by lib/documents/docx.ts (strict tag/attribute/scheme allowlist).
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <SecurityWatermark lines={watermarkLines} />
          </article>
        )}
      </div>
      {html !== null && (
        <ViewerToolbar
          zoomPercent={zoom}
          onZoomIn={() => setZoom((z) => Math.min(300, z + 25))}
          onZoomOut={() => setZoom((z) => Math.max(50, z - 25))}
        />
      )}
    </div>
  );
}
