import Link from "next/link";
import { EyeOff, Lock, ShieldCheck, Stamp } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";

const FEATURES = [
  { icon: Lock, title: "Private storage", body: "Documents live in private storage. No public links, ever." },
  { icon: ShieldCheck, title: "Strict access control", body: "Every request is authenticated and checked against document ownership." },
  { icon: EyeOff, title: "View-only", body: "Read PDF and DOCX files in the browser with no download workflow." },
  { icon: Stamp, title: "Watermarked", body: "Each view is stamped with the viewer's identity and the time." },
];

export default async function LandingPage() {
  const user = await getCurrentUser();
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 sm:px-6">
        <span className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="h-6 w-6 text-indigo-600" aria-hidden="true" />
          SecureDocs
        </span>
        <nav className="flex items-center gap-3 text-sm font-semibold">
          {user ? (
            <Link href="/dashboard" className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500">
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-4 py-2 text-slate-700 hover:bg-slate-200">
                Sign in
              </Link>
              <Link href="/signup" className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500">
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-4 pb-12 pt-16 text-center sm:px-6">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Confidential documents, viewed — not handed out.
        </h1>
        <p className="mt-6 text-lg text-slate-600">
          Upload PDF and Word documents to private storage and read them securely in your browser.
        </p>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-4 pb-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <Icon className="h-6 w-6 text-indigo-600" aria-hidden="true" />
            <h2 className="mt-4 font-semibold text-slate-900">{title}</h2>
            <p className="mt-2 text-sm text-slate-600">{body}</p>
          </div>
        ))}
      </section>

      <p className="mx-auto max-w-3xl px-4 pb-16 text-center text-xs text-slate-500 sm:px-6">
        SecureDocs prevents normal application-level downloads and direct storage access. It is not DRM and cannot
        prevent screenshots, screen recording, browser inspection or other copying after authorised rendering.
      </p>
    </main>
  );
}
