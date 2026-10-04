"use client";

import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/client/api";
import type { ViewerEvent } from "@/lib/validation/schemas";

type Reason = "focus" | "pointer" | "key";

/** How long a capture key keeps the content hidden. */
const KEY_SHIELD_MS = 3000;
/** Minimum gap between two audit reports of the same kind. */
const REPORT_GAP_MS: Record<ViewerEvent, number> = {
  focus_lost: 60_000,
  print_screen: 5_000,
  capture_shortcut: 5_000,
};

/**
 * DETERRENT ONLY — browsers cannot block screenshots. Hides (blurs) the document when the
 * viewer is likely being captured:
 *  - the window loses focus or the tab is hidden (Snipping Tool / ShareX overlays, app switch),
 *  - the pointer leaves the page (reaching for a capture tool in the taskbar or tray),
 *  - Print Screen, the Windows key (Win+Shift+S) or macOS Cmd+Shift+3/4/5 is pressed.
 * Focus loss and capture keys are reported to the audit log. Tools that grab the screen
 * on a global hotkey before the browser notices, and phone cameras, are not stopped;
 * the watermark identifies the viewer in any such capture.
 *
 * The attribute is set directly on the element (not via React state) so the blur is
 * applied in the same frame as the event, before an overlay screenshot is taken.
 */
export function useCaptureShield(documentId: string) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reasons = new Set<Reason>();
    const lastReport = new Map<ViewerEvent, number>();
    let keyTimer: ReturnType<typeof setTimeout> | undefined;

    const apply = () => {
      const el = ref.current;
      if (el) el.dataset.shielded = reasons.size > 0 ? "true" : "false";
    };
    const shield = (reason: Reason) => {
      reasons.add(reason);
      apply();
    };
    const unshield = (reason: Reason) => {
      reasons.delete(reason);
      apply();
    };

    const report = (type: ViewerEvent) => {
      const now = Date.now();
      if (now - (lastReport.get(type) ?? 0) < REPORT_GAP_MS[type]) return;
      lastReport.set(type, now);
      void apiFetch(`/api/documents/${encodeURIComponent(documentId)}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
        keepalive: true,
      }).catch(() => undefined);
    };

    const keyShield = () => {
      shield("key");
      clearTimeout(keyTimer);
      keyTimer = setTimeout(() => unshield("key"), KEY_SHIELD_MS);
    };

    const onBlur = () => {
      shield("focus");
      report("focus_lost");
    };
    const onFocus = () => unshield("focus");
    const onVisibility = () => (document.visibilityState === "hidden" ? onBlur() : onFocus());
    const onPointerOut = (e: MouseEvent) => {
      if (!e.relatedTarget) shield("pointer"); // left the page, not just an element
    };
    const onPointerIn = () => unshield("pointer");

    const isPrintScreen = (e: KeyboardEvent) => e.key === "PrintScreen" || e.code === "PrintScreen";
    const onKeyDown = (e: KeyboardEvent) => {
      if (isPrintScreen(e)) {
        keyShield();
        report("print_screen");
      } else if (e.key === "Meta" || e.key === "OS") {
        keyShield(); // Windows key: Win+Shift+S opens the Snipping Tool
      } else if (e.metaKey && e.shiftKey && ["s", "3", "4", "5"].includes(e.key.toLowerCase())) {
        keyShield();
        report("capture_shortcut");
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Windows often delivers only keyup for Print Screen, after the capture.
      if (!isPrintScreen(e)) return;
      keyShield();
      report("print_screen");
      // Best effort: replace a full-screen capture placed on the clipboard.
      navigator.clipboard?.writeText("").catch(() => undefined);
    };

    if (!document.hasFocus()) shield("focus");
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("mouseout", onPointerOut);
    document.addEventListener("mouseover", onPointerIn);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      clearTimeout(keyTimer);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("mouseout", onPointerOut);
      document.removeEventListener("mouseover", onPointerIn);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [documentId]);

  return ref;
}
