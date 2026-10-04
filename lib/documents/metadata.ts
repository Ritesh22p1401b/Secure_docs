import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AuthContext } from "@/lib/auth/session";
import type { Prisma } from "@/lib/generated/prisma/client";
import { DOCX_MIME } from "./docx";

export type DocumentKind = "pdf" | "docx";

/** The ONLY shape of document data sent to the browser. No storage key, URL or token. */
export interface DocumentDTO {
  id: string;
  name: string;
  mimeType: string;
  kind: DocumentKind;
  sizeBytes: number;
  createdAt: string;
  /** "owner" may view, share and delete; "shared" may only view. */
  access: "owner" | "shared";
  /** Owner's email — present only on documents shared with the caller. */
  sharedBy?: string;
}

export function kindOf(mimeType: string): DocumentKind {
  return mimeType === DOCX_MIME ? "docx" : "pdf";
}

export function toDocumentDTO(
  doc: { id: string; originalName: string; mimeType: string; sizeBytes: bigint; createdAt: Date },
  share?: { ownerEmail: string },
): DocumentDTO {
  return {
    id: doc.id,
    name: doc.originalName,
    mimeType: doc.mimeType,
    kind: kindOf(doc.mimeType),
    sizeBytes: Number(doc.sizeBytes),
    createdAt: doc.createdAt.toISOString(),
    access: share ? "shared" : "owner",
    ...(share ? { sharedBy: share.ownerEmail } : {}),
  };
}

const DTO_SELECT = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
  owner: { select: { email: true } },
} as const satisfies Prisma.DocumentSelect;

export interface ListQuery {
  page: number;
  limit: number;
  q?: string;
  sort: "newest" | "oldest" | "name";
  scope: "owned" | "shared";
}

/**
 * Lists the caller's own documents ("owned") or documents explicitly shared with the
 * caller ("shared"). Never anything else. Metadata search only (never content).
 */
export async function listDocuments(auth: AuthContext, query: ListQuery) {
  const where: Prisma.DocumentWhereInput = {
    ...(query.scope === "shared"
      ? { shares: { some: { recipientId: auth.userId } }, NOT: { ownerId: auth.userId } }
      : { ownerId: auth.userId }),
    ...(query.q ? { originalName: { contains: query.q, mode: "insensitive" } } : {}),
  };
  const orderBy: Prisma.DocumentOrderByWithRelationInput[] =
    query.sort === "oldest"
      ? [{ createdAt: "asc" }, { id: "asc" }]
      : query.sort === "name"
        ? [{ originalName: "asc" }, { id: "asc" }]
        : [{ createdAt: "desc" }, { id: "desc" }];

  const [rows, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: DTO_SELECT,
    }),
    prisma.document.count({ where }),
  ]);

  return {
    documents: rows.map(({ owner, ...doc }) =>
      toDocumentDTO(doc, query.scope === "shared" ? { ownerEmail: owner.email } : undefined),
    ),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}
