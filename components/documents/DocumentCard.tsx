import Link from "next/link";
import { FileText, FileType2, Share2, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatBytes, formatDate } from "@/lib/client/api";
import type { DocumentDTO } from "@/lib/documents/metadata";

interface DocumentCardProps {
  doc: DocumentDTO;
  onDelete: (doc: DocumentDTO) => void;
  onShare: (doc: DocumentDTO) => void;
}

export function DocumentCard({ doc, onDelete, onShare }: DocumentCardProps) {
  const Icon = doc.kind === "pdf" ? FileText : FileType2;
  const owned = doc.access === "owner";
  return (
    <li className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-center">
      <Icon className={`h-8 w-8 shrink-0 ${doc.kind === "pdf" ? "text-red-600" : "text-blue-600"}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900" title={doc.name}>
          {doc.name}
        </p>
        <p className="text-sm text-slate-600">
          {doc.kind.toUpperCase()} • {formatBytes(doc.sizeBytes)} • {formatDate(doc.createdAt)}
        </p>
        {!owned && doc.sharedBy && (
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-indigo-700">
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Shared by {doc.sharedBy} · view only
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/documents/${doc.id}`}
          className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          View<span className="sr-only"> {doc.name}</span>
        </Link>
        {owned && (
          <>
            <Button variant="secondary" onClick={() => onShare(doc)} aria-label={`Share ${doc.name}`}>
              <Share2 className="h-4 w-4" aria-hidden="true" />
              Share
            </Button>
            <Button variant="secondary" onClick={() => onDelete(doc)} aria-label={`Delete ${doc.name}`}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
