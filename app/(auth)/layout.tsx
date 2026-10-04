import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold text-slate-900">
        <ShieldCheck className="h-6 w-6 text-indigo-600" aria-hidden="true" />
        SecureDocs
      </Link>
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">{children}</div>
    </main>
  );
}
