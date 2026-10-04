"use client";

import { ChevronLeft, ChevronRight, MoveHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import type { ReactNode } from "react";

// Intentionally has NO download, print, save or "open original" controls.

interface ViewerToolbarProps {
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth?: () => void;
  fitWidthActive?: boolean;
  page?: number;
  numPages?: number;
  onPageChange?: (page: number) => void;
}

function IconButton({ label, onClick, disabled, pressed, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg p-2 text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-40 ${
        pressed ? "bg-indigo-50 text-indigo-700" : ""
      }`}
    >
      {children}
    </button>
  );
}

export function ViewerToolbar(props: ViewerToolbarProps) {
  const { zoomPercent, onZoomIn, onZoomOut, onFitWidth, fitWidthActive, page, numPages, onPageChange } = props;
  return (
    <div
      role="toolbar"
      aria-label="Document viewer controls"
      className="no-print sticky bottom-0 z-20 flex flex-wrap items-center justify-center gap-1 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur sm:gap-3"
    >
      <IconButton label="Zoom out" onClick={onZoomOut} disabled={zoomPercent <= 50}>
        <ZoomOut className="h-5 w-5" aria-hidden="true" />
      </IconButton>
      <span className="w-14 text-center text-sm tabular-nums text-slate-700" aria-live="polite">
        {zoomPercent}%
      </span>
      <IconButton label="Zoom in" onClick={onZoomIn} disabled={zoomPercent >= 300}>
        <ZoomIn className="h-5 w-5" aria-hidden="true" />
      </IconButton>
      {onFitWidth && (
        <IconButton label="Fit to width" onClick={onFitWidth} pressed={fitWidthActive}>
          <MoveHorizontal className="h-5 w-5" aria-hidden="true" />
        </IconButton>
      )}
      {page !== undefined && numPages !== undefined && onPageChange && (
        <div className="flex items-center gap-1 border-l border-slate-200 pl-2 sm:pl-3">
          <IconButton label="Previous page" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </IconButton>
          <label className="flex items-center gap-1 text-sm text-slate-700">
            <span className="sr-only">Page number</span>
            <input
              type="number"
              min={1}
              max={numPages}
              value={page}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1 && n <= numPages) onPageChange(n);
              }}
              className="w-14 rounded-md border-0 py-1 text-center text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600"
            />
            <span aria-hidden="true">/ {numPages}</span>
            <span className="sr-only">of {numPages}</span>
          </label>
          <IconButton label="Next page" onClick={() => onPageChange(page + 1)} disabled={page >= numPages}>
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        </div>
      )}
    </div>
  );
}
