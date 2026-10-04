import type { Metadata } from "next";
import Link from "next/link";
import { DocumentList, type ListScope } from "@/components/documents/DocumentList";

export const metadata: Metadata = { title: "Documents · SecureDocs" };

const TABS: { scope: ListScope; label: string; href: string }[] = [
  { scope: "owned", label: "My documents", href: "/documents" },
  { scope: "shared", label: "Shared with me", href: "/documents?tab=shared" },
];

export default async function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  const { tab } = await searchParams;
  const scope: ListScope = tab === "shared" ? "shared" : "owned";
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <nav aria-label="Document views" className="mb-6 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t.scope}
            href={t.href}
            aria-current={t.scope === scope ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              t.scope === scope
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <DocumentList key={scope} scope={scope} pageSize={20} />
    </main>
  );
}
