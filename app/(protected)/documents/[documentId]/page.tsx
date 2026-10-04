import { createHash } from "node:crypto";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DocumentViewer } from "@/components/documents/DocumentViewer";
import { findViewableDocument } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/lib/auth/session";
import { toDocumentDTO } from "@/lib/documents/metadata";
import { audit } from "@/lib/security/audit";

// Generic title: filenames can be sensitive and titles persist in browser history.
export const metadata: Metadata = { title: "Secure viewer · SecureDocs" };

export default async function DocumentViewerPage({ params }: PageProps<"/documents/[documentId]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { documentId } = await params;
  // Owner, or a user the owner explicitly shared with. Anything else: same 404 as "missing".
  const doc = await findViewableDocument(user, documentId);
  if (!doc) notFound();

  await audit({
    action: "DOCUMENT_VIEW",
    userId: user.userId,
    documentId: doc.id,
    request: { headers: await headers() },
    metadata: { access: doc.access },
  });

  // Watermark identity is derived here, server-side, from the authenticated session.
  const docTag = createHash("sha256").update(doc.id).digest("hex").slice(0, 8);
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const watermarkLines = ["CONFIDENTIAL", user.email, `${stamp} · ${docTag}`];

  const dto = toDocumentDTO(doc, doc.access === "shared" ? { ownerEmail: doc.ownerEmail } : undefined);
  return <DocumentViewer document={dto} watermarkLines={watermarkLines} />;
}
