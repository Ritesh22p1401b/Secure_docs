import type { Metadata } from "next";
import { DocumentList } from "@/components/documents/DocumentList";
import { DocumentUpload } from "@/components/documents/DocumentUpload";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Dashboard · SecureDocs" };

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Confidential Documents</h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload, securely view and share your private PDF and Word documents.
        </p>
      </div>
      <DocumentUpload maxSizeMb={env().MAX_DOCUMENT_SIZE_MB} />
      <DocumentList pageSize={5} compact />
      <DocumentList pageSize={5} compact scope="shared" />
    </main>
  );
}
