"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui/Spinner";
import { refreshSession } from "@/lib/client/api";
import { safeNextPath } from "@/lib/validation/redirect";

// Reached when the short-lived access token expired during navigation. Rotates the
// refresh token via a CSRF-protected POST, then resumes; falls back to the login page.
function Refresher() {
  const params = useSearchParams();
  useEffect(() => {
    const next = safeNextPath(params.get("next"));
    refreshSession().then((ok) => {
      window.location.replace(ok ? next : `/login?next=${encodeURIComponent(next)}`);
    });
  }, [params]);
  return <Spinner label="Restoring your secure session…" />;
}

export default function RefreshPage() {
  return (
    <main className="flex min-h-screen items-center justify-center text-slate-700">
      <Suspense fallback={<Spinner label="Loading…" />}>
        <Refresher />
      </Suspense>
    </main>
  );
}
