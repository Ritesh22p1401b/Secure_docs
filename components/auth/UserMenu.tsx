"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, User } from "lucide-react";

export function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      // Full navigation: auth cookies changed, so drop all client state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
      >
        <User className="h-4 w-4" aria-hidden="true" />
        <span className="hidden max-w-48 truncate md:inline">{email}</span>
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Account menu</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-60 rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200">
          <p className="truncate px-3 py-2 text-xs text-slate-500">{email}</p>
          <Link role="menuitem" href="/dashboard" className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-100 sm:hidden">
            Dashboard
          </Link>
          <Link role="menuitem" href="/documents" className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-100 sm:hidden">
            Documents
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={logout}
            disabled={busy}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
