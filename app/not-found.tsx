import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Not found</h1>
      <p className="mt-2 text-slate-600">The page or document you requested does not exist or is not available.</p>
      <Link href="/dashboard" className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
        Go to dashboard
      </Link>
    </main>
  );
}
