"use client";

import { useRef, useState, type DragEvent } from "react";
import { upload } from "@vercel/blob/client";
import { CheckCircle2, FileUp, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { apiFetch, csrfHeaders, readErrorMessage } from "@/lib/client/api";
import { DOCUMENTS_CHANGED_EVENT } from "@/lib/documents/constants";

const ACCEPT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

type Phase = "idle" | "validating" | "uploading" | "processing" | "completed" | "failed";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  validating: "Validating…",
  uploading: "Uploading securely…",
  processing: "Verifying document…",
  completed: "Upload complete",
  failed: "Upload failed",
};

interface Ticket {
  uploadId: string;
  pathname: string;
  uploadMode: "vercel" | "local";
}

/** Local development driver: PUT the bytes to our own endpoint (XHR for progress events). */
function uploadToLocalStorage(ticket: Ticket, file: File, mimeType: string, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/documents/upload/local/${encodeURIComponent(ticket.uploadId)}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", mimeType);
    for (const [k, v] of Object.entries(csrfHeaders())) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = "Upload failed. Please try again.";
      try {
        const body: unknown = JSON.parse(xhr.responseText);
        if (body && typeof body === "object" && "error" in body && typeof body.error === "string") message = body.error;
      } catch {
        /* non-JSON */
      }
      reject(new UploadError(message));
    };
    xhr.onerror = () => reject(new UploadError("Network error. Please try again."));
    xhr.send(file);
  });
}

class UploadError extends Error {}

export function DocumentUpload({ maxSizeMb }: { maxSizeMb: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const toast = useToast();
  const busy = phase === "validating" || phase === "uploading" || phase === "processing";

  /** UX pre-checks only — the server repeats and extends every check. */
  function precheck(file: File): string | null {
    const dot = file.name.lastIndexOf(".");
    const ext = dot > 0 ? file.name.slice(dot).toLowerCase() : "";
    const mime = ACCEPT[ext];
    if (!mime) return "Only .pdf and .docx files are allowed.";
    if (file.type && file.type !== mime) return "File type does not match its extension.";
    if (file.size === 0) return "File is empty.";
    if (file.size > maxSizeMb * 1024 * 1024) return `File exceeds the ${maxSizeMb} MB limit.`;
    return null;
  }

  async function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    setProgress(0);
    setPhase("validating");

    const problem = precheck(file);
    if (problem) return fail(problem);
    const dot = file.name.lastIndexOf(".");
    const mimeType = ACCEPT[file.name.slice(dot).toLowerCase()]!;

    try {
      // 1) Reserve a server-generated private storage path.
      const init = await apiFetch("/api/documents/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, mimeType }),
      });
      if (!init.ok) return fail(await readErrorMessage(init));
      const ticket = (await init.json()) as Ticket;

      // 2) Upload the bytes to PRIVATE storage: Vercel Blob with a path-scoped token,
      //    or (local development only) the app's own size-capped endpoint.
      setPhase("uploading");
      if (ticket.uploadMode === "local") {
        await uploadToLocalStorage(ticket, file, mimeType, setProgress);
      } else {
        await upload(ticket.pathname, file, {
          access: "private",
          contentType: mimeType,
          handleUploadUrl: "/api/documents/upload/token",
          clientPayload: ticket.uploadId,
          headers: csrfHeaders(),
          multipart: file.size > 8 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
        });
      }

      // 3) Server validates the stored bytes before the document becomes visible.
      setPhase("processing");
      const done = await apiFetch("/api/documents/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: ticket.uploadId }),
      });
      if (!done.ok) return fail(await readErrorMessage(done));
      const body = (await done.json()) as { notice?: string };

      setPhase("completed");
      toast(body.notice ? `Uploaded. ${body.notice}` : "Document uploaded.", body.notice ? "info" : "success");
      window.dispatchEvent(new Event(DOCUMENTS_CHANGED_EVENT));
    } catch (err) {
      fail(err instanceof UploadError ? err.message : "Upload failed. Please try again.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function fail(message: string) {
    setPhase("failed");
    setError(message);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !busy) void handleFile(file);
  }

  return (
    <section aria-labelledby="upload-heading" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 id="upload-heading" className="text-base font-semibold text-slate-900">
        Upload a document
      </h2>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300"
        }`}
      >
        <FileUp className="h-8 w-8 text-slate-400" aria-hidden="true" />
        <p className="mt-2 text-sm text-slate-600">
          Drag a file here, or{" "}
          <span className="sr-only">use the button to choose a file.</span>
        </p>
        <input
          ref={inputRef}
          id="document-file"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <Button type="button" className="mt-3" onClick={() => inputRef.current?.click()} loading={busy}>
          Upload Document
        </Button>
        <p className="mt-3 text-xs text-slate-500">PDF or DOCX, up to {maxSizeMb} MB. Macro-enabled files are rejected.</p>
      </div>

      {phase !== "idle" && (
        <div className="mt-4" aria-live="polite">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate font-medium text-slate-800">{fileName}</span>
            <span className="ml-3 flex shrink-0 items-center gap-1 text-slate-600">
              {phase === "completed" && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
              {phase === "failed" && <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" />}
              {PHASE_LABEL[phase]}
              {phase === "uploading" && ` ${progress}%`}
            </span>
          </div>
          {(phase === "uploading" || phase === "processing") && (
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={phase === "processing" ? 100 : progress}
              aria-label="Upload progress"
            >
              <div
                className={`h-full bg-indigo-600 transition-all ${phase === "processing" ? "animate-pulse" : ""}`}
                style={{ width: `${phase === "processing" ? 100 : progress}%` }}
              />
            </div>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

