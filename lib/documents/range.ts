/** Largest byte range served per request (keeps responses under serverless body limits). */
export const MAX_RANGE_BYTES = 4 * 1024 * 1024;

export type RangeParse =
  | { kind: "none" }
  | { kind: "range"; start: number; end: number }
  | { kind: "invalid" };

/**
 * Parses a single `bytes=start-end` range. Multi-range, suffix and open-ended forms are
 * normalised or rejected; spans are capped at MAX_RANGE_BYTES.
 */
export function parseRangeHeader(header: string | null, size: number): RangeParse {
  if (!header) return { kind: "none" };
  const m = /^bytes=(\d{1,15})-(\d{0,15})$/.exec(header.trim());
  if (!m || size <= 0) return { kind: "invalid" };
  const start = Number(m[1]);
  let end = m[2] === "" ? size - 1 : Number(m[2]);
  if (start >= size || end < start) return { kind: "invalid" };
  end = Math.min(end, size - 1, start + MAX_RANGE_BYTES - 1);
  return { kind: "range", start, end };
}
