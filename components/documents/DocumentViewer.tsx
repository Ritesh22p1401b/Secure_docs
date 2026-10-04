"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, EyeOff, Lock } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { DocumentDTO } from "@/lib/documents/metadata";
import { DocxViewer } from "./DocxViewer";
import { PdfViewer } from "./PdfViewer";
import { useCaptureShield } from "./useCaptureShield";

/**
 * Chooses the viewer by document type and applies client-side DETERRENTS (context menu,
 * drag, copy, Ctrl/Cmd+S and Ctrl/Cmd+P, blur on focus loss / capture keys via
 * useCaptureShield). These are not a security boundary — the
 * boundary is server-side authentication, authorisation and private storage.
 * Normal keyboard navigation and accessibility are left intact.
 */
export function DocumentViewer({ document: doc, watermarkLines }: { document: DocumentDTO; watermarkLines: string[] }) {
  const toast = useToast();
  const [pageInfo, setPageInfo] = useState<{ page: number; numPages: number } | null>(null);
  const onPageInfo = useCallback((page: number, numPages: number) => setPageInfo({ page, numPages }), []);
  const shieldRef = useCaptureShield(doc.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === "s" || key === "p")) {
        e.preventDefault();
        toast("Saving and printing are disabled for confidential documents.", "info");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toast]);

  return (
    <div>
      <div className="no-print flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2 sm:px-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-sm font-semibold text-slate-900 sm:text-base" title={doc.name}>
            {doc.name}
          </h1>
          {doc.access === "shared" && doc.sharedBy && (
            <p className="truncate text-xs text-indigo-700">Shared by {doc.sharedBy} · view only</p>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs text-slate-600 sm:text-sm">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          {pageInfo ? `Page ${pageInfo.page}/${pageInfo.numPages}` : "View only"}
        </span>
      </div>

      <div ref={shieldRef} className="capture-shield" data-shielded="false">
        <div
          className="secure-viewer"
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          onCopy={(e) => e.preventDefault()}
          onCut={(e) => e.preventDefault()}
        >
          {doc.kind === "pdf" ? (
            <PdfViewer documentId={doc.id} sizeBytes={doc.sizeBytes} watermarkLines={watermarkLines} onPageInfo={onPageInfo} />
          ) : (
            <DocxViewer documentId={doc.id} watermarkLines={watermarkLines} />
          )}
        </div>
        <div className="capture-shield-notice" aria-hidden="true">
          <EyeOff className="h-6 w-6" aria-hidden="true" />
          <p className="font-semibold">Content hidden</p>
          <p className="text-sm">Return to this window and move the pointer over it to continue viewing.</p>
        </div>
      </div>
      <p className="print-notice">Printing confidential documents is disabled.</p>
    </div>
  );
}
