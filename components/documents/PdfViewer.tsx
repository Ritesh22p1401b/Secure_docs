"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Spinner } from "@/components/ui/Spinner";
import { apiFetch } from "@/lib/client/api";
import { PDF_RANGE_CHUNK_BYTES, VIEWER_HEADER } from "@/lib/documents/constants";
import { drawCanvasWatermark, SecurityWatermark } from "./SecurityWatermark";
import { ViewerToolbar } from "./ViewerToolbar";

interface PdfViewerProps {
  documentId: string;
  sizeBytes: number;
  watermarkLines: string[];
  onPageInfo?: (page: number, numPages: number) => void;
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

/**
 * Renders PDF pages to <canvas> only (no text layer, no annotation links, no XFA, no
 * scripting). Bytes are fetched in authenticated byte ranges from the content endpoint,
 * so the browser never receives a storage URL and nothing is offered for download.
 */
export function PdfViewer({ documentId, sizeBytes, watermarkLines, onPageInfo }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [rendering, setRendering] = useState(false);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const [effectiveScale, setEffectiveScale] = useState(1);

  // Load the document through an authenticated range transport.
  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    const url = `/api/documents/${encodeURIComponent(documentId)}/content`;

    const fetchRange = async (start: number, endInclusive: number): Promise<Uint8Array> => {
      const res = await apiFetch(url, { headers: { [VIEWER_HEADER]: "1", Range: `bytes=${start}-${endInclusive}` } });
      if (res.status === 206) return new Uint8Array(await res.arrayBuffer());
      if (res.status === 200) return new Uint8Array(await res.arrayBuffer()).subarray(start, endInclusive + 1);
      throw new Error(`content request failed (${res.status})`);
    };

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

        const initial = await fetchRange(0, Math.min(sizeBytes, PDF_RANGE_CHUNK_BYTES) - 1);

        class AuthenticatedRangeTransport extends pdfjs.PDFDataRangeTransport {
          override requestDataRange(begin: number, end: number) {
            fetchRange(begin, end - 1)
              .then((chunk) => this.onDataRange(begin, chunk))
              .catch(() => !cancelled && setStatus("error"));
          }
        }

        task = pdfjs.getDocument({
          range: new AuthenticatedRangeTransport(sizeBytes, initial),
          rangeChunkSize: PDF_RANGE_CHUNK_BYTES,
          disableAutoFetch: true,
          disableStream: true,
          enableXfa: false,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          wasmUrl: "/pdfjs/wasm/",
          iccUrl: "/pdfjs/iccs/",
        });
        const doc = await task.promise;
        if (cancelled) return;
        setPdf(doc);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      void task?.destroy();
    };
  }, [documentId, sizeBytes]);

  // Track available width for fit-to-width (responsive / mobile).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(Math.floor(entry!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (pdf) onPageInfo?.(page, pdf.numPages);
  }, [pdf, page, onPageInfo]);

  // Render the current page.
  useEffect(() => {
    if (!pdf || !canvasRef.current || containerWidth === 0) return;
    let cancelled = false;
    const canvas = canvasRef.current;

    (async () => {
      setRendering(true);
      try {
        const pdfPage = await pdf.getPage(page);
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = fitWidth ? Math.max(0.25, (containerWidth - 24) / base.width) : zoom;
        const viewport = pdfPage.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        renderTaskRef.current?.cancel();
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const task = pdfPage.render({
          canvas,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;
        drawCanvasWatermark(canvas, watermarkLines);
        setEffectiveScale(scale);
      } catch (err) {
        if (!cancelled && !(err instanceof Error && err.name === "RenderingCancelledException")) setStatus("error");
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf, page, zoom, fitWidth, containerWidth, watermarkLines]);

  const goTo = useCallback((n: number) => {
    if (pdf && n >= 1 && n <= pdf.numPages) setPage(n);
  }, [pdf]);

  const zoomBy = (dir: 1 | -1) => {
    const current = fitWidth ? effectiveScale : zoom;
    const next = dir === 1 ? ZOOM_STEPS.find((z) => z > current + 0.01) : [...ZOOM_STEPS].reverse().find((z) => z < current - 0.01);
    setFitWidth(false);
    setZoom(next ?? current);
  };

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col">
      <div
        ref={containerRef}
        tabIndex={0}
        aria-label="Document page"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "PageDown") goTo(page + 1);
          if (e.key === "ArrowLeft" || e.key === "PageUp") goTo(page - 1);
        }}
        className="relative flex-1 overflow-auto bg-slate-200 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-600"
      >
        {status === "loading" && (
          <div className="flex h-64 items-center justify-center text-slate-700">
            <Spinner size="lg" label="Loading secure document…" />
          </div>
        )}
        {status === "error" && (
          <div role="alert" className="mx-auto mt-16 max-w-md rounded-xl bg-white p-6 text-center text-sm text-red-800 shadow">
            This document could not be displayed. It may have been removed, or your session may have expired.
          </div>
        )}
        <div className={`relative mx-auto w-fit shadow-lg ${status === "ready" ? "" : "hidden"}`}>
          <canvas ref={canvasRef} className="block bg-white" aria-label={`Page ${page}`} role="img" />
          <SecurityWatermark lines={watermarkLines} />
          {rendering && (
            <div className="absolute right-2 top-2 z-20 rounded-full bg-white/90 p-1 text-slate-600 shadow">
              <Spinner size="sm" />
            </div>
          )}
        </div>
      </div>
      {pdf && (
        <ViewerToolbar
          zoomPercent={Math.round((fitWidth ? effectiveScale : zoom) * 100)}
          onZoomIn={() => zoomBy(1)}
          onZoomOut={() => zoomBy(-1)}
          onFitWidth={() => setFitWidth(true)}
          fitWidthActive={fitWidth}
          page={page}
          numPages={pdf.numPages}
          onPageChange={goTo}
        />
      )}
    </div>
  );
}
