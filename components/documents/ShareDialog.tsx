"use client";

import { useEffect, useState, type FormEvent } from "react";
import { UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { apiFetch, formatDate, readErrorMessage } from "@/lib/client/api";
import type { DocumentDTO } from "@/lib/documents/metadata";

interface Share {
  id: string;
  email: string;
  createdAt: string;
}

/**
 * Owner-only dialog: grant view access to a registered user by their login email, and
 * revoke it. Recipients get view-only access (no download, share or delete) and see the
 * document watermarked with their own identity.
 */
export function ShareDialog({ doc, onClose }: { doc: DocumentDTO | null; onClose: () => void }) {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const toast = useToast();
  const docId = doc?.id ?? null;

  useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    (async () => {
      const res = await apiFetch(`/api/documents/${encodeURIComponent(docId)}/shares`);
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(await readErrorMessage(res, "Unable to load sharing settings."));
        return;
      }
      setShares(((await res.json()) as { shares: Share[] }).shares);
    })().catch(() => !cancelled && setLoadError("Unable to load sharing settings."));
    return () => {
      cancelled = true;
    };
  }, [docId]);

  function close() {
    setShares(null);
    setLoadError(null);
    setFormError(null);
    setEmail("");
    onClose();
  }

  async function onShare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!docId) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/documents/${encodeURIComponent(docId)}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        setFormError(await readErrorMessage(res, "Unable to share the document."));
        return;
      }
      const { share } = (await res.json()) as { share: Share };
      setShares((prev) => [...(prev ?? []), share]);
      setEmail("");
      toast(`Shared with ${share.email}.`, "success");
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(share: Share) {
    if (!docId) return;
    setRevoking(share.id);
    try {
      const res = await apiFetch(
        `/api/documents/${encodeURIComponent(docId)}/shares/${encodeURIComponent(share.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        toast(await readErrorMessage(res, "Unable to remove access."), "error");
        return;
      }
      setShares((prev) => (prev ?? []).filter((s) => s.id !== share.id));
      toast(`Access removed for ${share.email}.`, "success");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <Modal
      open={doc !== null}
      title="Share document"
      onClose={close}
      footer={
        <Button variant="secondary" onClick={close}>
          Done
        </Button>
      }
    >
      <p className="truncate font-medium text-slate-900" title={doc?.name}>
        {doc?.name}
      </p>
      <p className="mt-1 text-slate-600">
        People you add can <strong>view only</strong> — they cannot download, share or delete it, and every page is
        watermarked with their identity.
      </p>

      <form onSubmit={onShare} className="mt-4 flex items-end gap-2" noValidate>
        <Input
          label="Recipient's login email"
          type="email"
          name="email"
          autoComplete="off"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={formError ?? undefined}
          className="flex-1"
        />
        <Button type="submit" loading={submitting} disabled={!email.trim()} className={formError ? "mb-6" : ""}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Share
        </Button>
      </form>

      <h3 className="mt-6 text-sm font-semibold text-slate-900">People with access</h3>
      {loadError ? (
        <p role="alert" className="mt-2 text-red-700">
          {loadError}
        </p>
      ) : shares === null ? (
        <div className="mt-2 text-slate-500">
          <Spinner size="sm" label="Loading…" />
        </div>
      ) : shares.length === 0 ? (
        <p className="mt-2 text-slate-600">Only you can view this document.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-200 rounded-lg ring-1 ring-slate-200" aria-label="People with access">
          {shares.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-slate-900">{s.email}</p>
                <p className="text-xs text-slate-500">Shared {formatDate(s.createdAt)}</p>
              </div>
              <Button
                variant="ghost"
                onClick={() => void revoke(s)}
                loading={revoking === s.id}
                aria-label={`Remove access for ${s.email}`}
                className="shrink-0 text-red-700"
              >
                <UserMinus className="h-4 w-4" aria-hidden="true" />
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
