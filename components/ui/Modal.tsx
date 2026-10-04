"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** Accessible modal built on the native <dialog> element (focus trap + Esc handling). */
export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId(); // unique per instance: several dialogs can coexist on a page

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl p-0 shadow-xl backdrop:bg-slate-900/50"
    >
      <div className="p-6">
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <div className="mt-2 text-sm text-slate-700">{children}</div>
      </div>
      {footer && <div className="flex justify-end gap-3 rounded-b-xl bg-slate-50 px-6 py-4">{footer}</div>}
    </dialog>
  );
}
