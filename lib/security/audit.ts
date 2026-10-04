import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getClientIp, getUserAgent, hashIp, logServerError, type HeaderSource } from "./request";

export type AuditAction =
  | "SIGNUP"
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "LOGOUT"
  | "TOKEN_REFRESH"
  | "DOCUMENT_UPLOAD"
  | "DOCUMENT_UPLOAD_REJECTED"
  | "DOCUMENT_VIEW"
  | "DOCUMENT_DELETE"
  | "DOCUMENT_SHARE"
  | "DOCUMENT_UNSHARE"
  | "VIEWER_FOCUS_LOST"
  | "SCREEN_CAPTURE_SUSPECTED"
  | "AUTH_FAILURE"
  | "CSRF_REJECTED"
  | "RATE_LIMIT"
  | "STORAGE_ERROR";

/** Only small, non-sensitive scalar values. Never tokens, passwords, file contents or storage URLs. */
export type AuditMetadata = Record<string, string | number | boolean | null>;

export interface AuditEvent {
  action: AuditAction;
  userId?: string | null;
  documentId?: string | null;
  /** A Request, or `{ headers: await headers() }` in Server Components. */
  request?: HeaderSource;
  metadata?: AuditMetadata;
}

/** Records an audit event. Never throws — auditing failures must not break the request. */
export async function audit(event: AuditEvent): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: event.action,
        userId: event.userId ?? null,
        documentId: event.documentId ?? null,
        ipHash: event.request ? hashIp(getClientIp(event.request)) : null,
        userAgent: event.request ? getUserAgent(event.request) : null,
        metadata: event.metadata ?? undefined,
      },
    });
  } catch (err) {
    logServerError(`Audit write failed for ${event.action}`, err);
  }
}
