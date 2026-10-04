import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { UserMenu } from "@/components/auth/UserMenu";
import { getCurrentUser, hasRefreshCookie } from "@/lib/auth/session";

/**
 * Server-side gate for every protected page. This is authoritative (DB-backed session
 * check), independent of proxy.ts, so a route missed by the proxy matcher stays protected.
 */
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect((await hasRefreshCookie()) ? "/refresh" : "/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-slate-900">
            <ShieldCheck className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            SecureDocs
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 text-sm">
            <Link href="/dashboard" className="hidden rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100 sm:inline">
              Dashboard
            </Link>
            <Link href="/documents" className="hidden rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100 sm:inline">
              Documents
            </Link>
            <UserMenu email={user.email} />
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
