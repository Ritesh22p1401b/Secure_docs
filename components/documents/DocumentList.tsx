"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { apiFetch, readErrorMessage } from "@/lib/client/api";
import type { DocumentDTO } from "@/lib/documents/metadata";
import { DocumentCard } from "./DocumentCard";
import { ShareDialog } from "./ShareDialog";
import { DOCUMENTS_CHANGED_EVENT } from "@/lib/documents/constants";

type Sort = "newest" | "oldest" | "name";

interface ListResponse {
  documents: DocumentDTO[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export type ListScope = "owned" | "shared";

interface DocumentListProps {
  pageSize?: number;
  compact?: boolean;
  /** "owned": my documents · "shared": documents other users shared with me (view only). */
  scope?: ListScope;
}

const TITLES: Record<ListScope, { full: string; compact: string; empty: string; headingId: string }> = {
  owned: {
    full: "Confidential Documents",
    compact: "Recent documents",
    empty: "No documents yet. Upload your first confidential document.",
    headingId: "documents-heading",
  },
  shared: {
    full: "Shared with me",
    compact: "Shared with me",
    empty: "No one has shared a document with you yet.",
    headingId: "shared-heading",
  },
};

export function DocumentList({ pageSize = 20, compact = false, scope = "owned" }: DocumentListProps) {
  const titles = TITLES[scope];
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The request key whose response is currently shown; loading = it differs from the wanted one.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocumentDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState<DocumentDTO | null>(null);
  const toast = useToast();

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const params = new URLSearchParams({ page: String(page), limit: String(pageSize), sort, scope });
  if (debounced) params.set("q", debounced);
  const queryString = params.toString();
  const requestKey = `${queryString}#${reloadKey}`;
  const loading = loadedKey !== requestKey;

  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let nextError: string | null = null;
      let nextData: ListResponse | null = null;
      try {
        const res = await apiFetch(`/api/documents?${queryString}`);
        if (res.ok) nextData = (await res.json()) as ListResponse;
        else nextError = await readErrorMessage(res, "Unable to load documents.");
      } catch {
        nextError = "Unable to load documents.";
      }
      if (cancelled) return;
      if (nextData) setData(nextData);
      setError(nextError);
      setLoadedKey(requestKey);
    })();
    return () => {
      cancelled = true;
    };
  }, [queryString, requestKey]);

  useEffect(() => {
    window.addEventListener(DOCUMENTS_CHANGED_EVENT, load);
    return () => window.removeEventListener(DOCUMENTS_CHANGED_EVENT, load);
  }, [load]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/documents/${encodeURIComponent(pendingDelete.id)}`, { method: "DELETE" });
      if (!res.ok) {
        toast(await readErrorMessage(res, "Unable to delete the document."), "error");
        return;
      }
      toast("Document deleted.", "success");
      setPendingDelete(null);
      void load();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section aria-labelledby={titles.headingId}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id={titles.headingId} className="text-lg font-semibold text-slate-900">
          {compact ? titles.compact : titles.full}
        </h2>
        {!compact && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block">
              <span className="sr-only">Search by filename</span>
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={100}
                placeholder="Search by filename"
                className="w-full rounded-lg border-0 py-2 pl-9 pr-3 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600 sm:w-64"
              />
            </label>
            <label className="block">
              <span className="sr-only">Sort documents</span>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as Sort);
                  setPage(1);
                }}
                className="w-full rounded-lg border-0 py-2 pl-3 pr-8 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name (A–Z)</option>
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="mt-4">
        {loading && !data ? (
          <ul className="space-y-3" aria-busy="true" aria-label="Loading documents">
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="h-20 animate-pulse rounded-xl bg-slate-200" />
            ))}
          </ul>
        ) : error ? (
          <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
            {error}{" "}
            <button type="button" onClick={() => void load()} className="font-semibold underline">
              Retry
            </button>
          </div>
        ) : data && data.documents.length === 0 ? (
          <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-600 ring-1 ring-slate-200">
            {debounced ? "No documents match your search." : titles.empty}
          </p>
        ) : (
          <ul className={`space-y-3 ${loading ? "opacity-60" : ""}`}>
            {data?.documents.map((doc) => <DocumentCard key={doc.id} doc={doc} onDelete={setPendingDelete} onShare={setSharing} />)}
          </ul>
        )}
      </div>

      {data && !compact && data.pagination.totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between text-sm">
          <Button variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-slate-600">
            Page {data.pagination.page} of {data.pagination.totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= data.pagination.totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </nav>
      )}
      {compact && data && data.pagination.total > pageSize && (
        <p className="mt-4 text-sm">
          <Link
            href={scope === "shared" ? "/documents?tab=shared" : "/documents"}
            className="font-semibold text-indigo-700 hover:underline"
          >
            View all {data.pagination.total} documents →
          </Link>
        </p>
      )}
      {loading && data && (
        <div className="mt-3 text-slate-500">
          <Spinner size="sm" label="Refreshing…" />
        </div>
      )}

      <Modal
        open={pendingDelete !== null}
        title="Delete document?"
        onClose={() => !deleting && setPendingDelete(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()} loading={deleting}>
              Delete permanently
            </Button>
          </>
        }
      >
        <p>
          <span className="font-medium">{pendingDelete?.name}</span> will be permanently removed from secure storage.
          This cannot be undone.
        </p>
      </Modal>

      <ShareDialog doc={sharing} onClose={() => setSharing(null)} />
    </section>
  );
}
