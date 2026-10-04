// Client-safe constants shared by the viewer and the content route.

/** Required on content requests; browsers cannot add it to navigations, links or iframes. */
export const VIEWER_HEADER = "x-securedocs-viewer";

/** pdf.js range-request chunk size (server caps each range at 4 MiB). */
export const PDF_RANGE_CHUNK_BYTES = 512 * 1024;

/** Window event fired after a successful upload so lists can refresh. */
export const DOCUMENTS_CHANGED_EVENT = "securedocs:documents-changed";
